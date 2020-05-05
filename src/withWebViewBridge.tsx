import * as React from 'react';
import * as uuid from 'uuid';

export type WebViewWithBridgeProps = {
    onBridgeError?: (e: unknown) => void;
    reactNativeApi: {
        [key: string]: (arg: any) => any;
    }
}

type ListenerType = (event: any) => boolean;

export type BaseWebViewType = {
    injectJavaScript: (js: string) => void;
}

export type BaseWebViewPropsType = {
    onNavigationStateChange?: (event: any) => any;
    onMessage?: (event: any) => any;
}

// source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#Examples
const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key: string, value: unknown) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return;
        }
        seen.add(value);
      }
      return value;
    };
};


export const withWebViewBridge = function<WebViewType extends BaseWebViewType, WebViewPropsType extends BaseWebViewPropsType>(BaseWebView: WebViewType) {
    return class extends React.Component<WebViewPropsType & WebViewWithBridgeProps> {
        public webview: WebViewType;
        /* private */ readonly _listeners: ListenerType[];

        constructor(props: WebViewPropsType & WebViewWithBridgeProps) {
            super(props);
            this._onWebViewMessage = this._onWebViewMessage.bind(this);
            this._addEventListener = this._addEventListener.bind(this);
            this._onNavigationStateChange = this._onNavigationStateChange.bind(this);
            this._listeners = [];
        }

        public invokeFunctionInWebview(webviewObjectReference: string, input: any, timeout: number = 1000) {
            return new Promise((resolve, reject) => {
                const invocationId = uuid.v4();

                setTimeout(function () {
                    reject(new Error('timeout'));
                }, timeout);

                this._addEventListener((data) => {
                    if (invocationId === data.invocationId) {
                        if (data.type === 'functionResponse') {
                            resolve(data.data);
                            return true;
                        } else if (data.type === 'functionRejection') {
                            reject(data.data);
                            return true;
                        }
                    }
                    return false;
                });

                //language=JavaScript
                this.webview.injectJavaScript(`
                    async function asyncCall() {
                        const f = eval(${webviewObjectReference});
                        try {
                            const response = await f(${JSON.stringify(input)});
                            // noinspection JSUnresolvedVariable
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'functionResponse',
                                invocationId: ${JSON.stringify(invocationId)},
                                data: response,
                            }));
                        } catch (e) {
                            // noinspection JSUnresolvedVariable
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'functionRejection',
                                invocationId: ${JSON.stringify(invocationId)},
                                data: e,
                            }));
                        }
                    }
                    // noinspection JSIgnoredPromiseFromCall
                    asyncCall();
                    true;
                `);
            });
        }

        /* private */ _addEventListener(listener: ListenerType) {
            this._listeners.push(listener);
        }

        /* private */ async _onWebViewMessage(event: any) {
            const requestingWebview = this.webview;
            if (this.props.onMessage) {
                event.persist();
            }
            
            let obj;
            try {
                obj = JSON.parse(event.nativeEvent.data);
            } catch (e) {
            }

            let i = this._listeners.length;
            while (i--) {
                const listener = this._listeners[i];
                const shouldRemove = listener(obj);
                if (shouldRemove) {
                    this._listeners.splice(i, 1);
                }
            }

            if (obj && obj.type === 'reactNativeFunctionInvocation') {
                const func = this.props.reactNativeApi[obj.name];
                try {
                    const response = await func(obj.data);

                    try {
                        //language=JavaScript
                        requestingWebview.injectJavaScript(`
                            window.postMessage(${JSON.stringify({
                                type: 'functionResponse',
                                invocationId: obj.invocationId,
                                data: response
                            }, getCircularReplacer())}, window.location.href);
                            true;
                        `);
                    } catch (e) {
                        if (this.props.onBridgeError) {
                            (this.props.onBridgeError as any)(e);
                        }
                    }
                } catch (e) {
                    try {
                        //language=JavaScript
                        requestingWebview.injectJavaScript(`
                        window.postMessage(${JSON.stringify({
                            type: 'functionRejection',
                            invocationId: obj.invocationId,
                            data: e
                        }, getCircularReplacer())}, window.location.href);
                        true;
                    `);
                    } catch (e) {
                        if (this.props.onBridgeError) {
                            (this.props.onBridgeError as any)(e);
                        }
                    }
                }
            }

            if (this.props.onMessage) {
                this.props.onMessage!(event)
            }
        }

        /* private */ _onNavigationStateChange(event: any) {
            //language=JavaScript
            this.webview.injectJavaScript(`
                if(window.getReactNativeApi === undefined) {
                    window.getReactNativeApi = (timeout = 1000) => new Proxy({}, {
                        get(_, name) {
                            return (arg) =>
                                new Promise(function (resolve, reject) {
                                    try {
                                        const invocationId = btoa(Math.random()).substring(0, 12);
                                        window.addEventListener('message', function _listener({data}) {
                                            if (data.invocationId === invocationId) { // if there is no data it will be an uncaught exception
                                                window.removeEventListener('message', _listener, false);
                                                try {
                                                    if (data.type === 'functionResponse') {
                                                        resolve(data.data);
                                                    } else if (data.type === 'functionRejection') {
                                                        if (data.data !== undefined) {
                                                            reject(data.data);
                                                        } else {
                                                            reject(new Error(\`bridge exception is undefined for function with name: \${name}\`));
                                                        }
                                                    } else {
                                                        reject(new Error(\`bridge unexpected type for function with name: \${name}\ unexpected type: \${data.type}\`));
                                                    }
                                                } catch (e) {
                                                    reject(e);
                                                }
                                            }
                                        }, false);
                                        setTimeout(function () {
                                            reject(new Error(\`bridge timeout for function with name: \${name}\`));
                                        }, timeout);
                                        // noinspection JSUnresolvedVariable
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'reactNativeFunctionInvocation',
                                            invocationId: invocationId,
                                            name: name,
                                            data: arg,
                                        }));
                                    } catch (e) {
                                        reject(e);
                                    }
                                })
                        }
                    });
                }
                true; // required or it might sometimes fail
            `);

            if (this.props.onNavigationStateChange) {
                this.props.onNavigationStateChange(event);
            }
        }

        render() {
            // @ts-ignore
            return <BaseWebView
                ref = {(ref: WebViewType) => this.webview = ref}
                {...this.props}
                onMessage = {this._onWebViewMessage}
                onNavigationStateChange = {this._onNavigationStateChange}
            />;
        }
    }
}
