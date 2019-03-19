# Setup

install react native webview package, the library wont work with the default webview

```
yarn install react-native-webview
```

install package

```
yarn install react-native-webview-bridge-seamless
```

make sure you import webview from `react-native-webview` and not from `react-native`

```
import {WebView, WebViewSharedProps} from 'react-native-webview';
import {withWebViewBridge} from 'react-native-webview-bridge-seamless';
```

wrap the webview

```
export const WebViewWithBridge = withWebViewBridge(WebView);
```

# Usage

```
class MySmartWebView extends React.Component<> {
    constructor(props) {
        super(props);
        this.getToken = this.getToken.bind(this);
    }

    async getToken(type) {
       if (type === 'A')
          return await getTokenA();
       else
          return await getTokenB();
    }

    render() {
       return <WebViewWithBridge
            source={{uri: 'https://your-page.io'}}
            reactNativeApi={{
                getToken: this.getToken
            }}
         />
    }
}

```

inside your web application we can interact with the defined app in the following way

```
const timeout = 5000; // promise will fail if no response in 5 seconds
const tokenA = await this.getReactNativeApi(timeout).getToken('A');
```
