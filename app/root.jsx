import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

export default function App() {
  return (
    <html suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />

        {/* 🔧 Clean any `fdprocessedid` attrs before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try{
    var clean=function(){
      var nodes=document.querySelectorAll('input[fdprocessedid], textarea[fdprocessedid], select[fdprocessedid]');
      for(var i=0;i<nodes.length;i++){ nodes[i].removeAttribute('fdprocessedid'); }
    };
    clean();
    // in case something re-adds it
    new MutationObserver(clean).observe(document.documentElement,{subtree:true, attributes:true, attributeFilter:['fdprocessedid']});
  }catch(e){}
})();
`,
          }}
        />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />

        {/* 🔇 Silence SendBeacon errors from metrics in dev/tunnel */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try{
    if(!('sendBeacon' in navigator)){
      navigator.sendBeacon=function(){return true;};
    } else {
      var _sb=navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon=function(){ try{return _sb.apply(this,arguments);}catch(e){return true;} };
    }
  }catch(e){}
})();
`,
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}
