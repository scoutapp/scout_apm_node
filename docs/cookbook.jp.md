# レシピー #

便利になるScoutの使い方の説明。

## データベース ##

`Scout`オブジェクトを使うとリクエスト途中のデータベースのファンクションをトレース出来ます:

```typescript
const express = require("express");
const app = express();
const scout = require("@scout_apm/scout-apm").expressMiddleware;

// ... セットアップコード ...

// ルート
app.use("/your-endpoint", (req, res) => {
    // Scoutのデータベーススパン開始
    req.scout
        .request // このexpressリクエストの中のScoutリクエスト
        .startSpan("Database/expensive-computation")
        .then(span => {

            // データベース実行
            yourDatabaseClient
                .expensiveComputation()
                .then(result => {
                    span.finish(); // スパン終了（エラーなし場合)
                    res.send(result);
                })
                .catch((err: Error) => {
                    span.finish(); // スパン終了(エラーあり場合)

                    // // (オプション) エラ情報のタグを付ける
                    // req.scout.request.addContext([
                    //     {name: "error", value: true},
                    //     {name: "error.stack", value: err.stack},
                    // ]);

                    // エラーロジック
                    res.send(yourErrorResult)
                });

       });
})
```

## テンプレートのレンダリング ##

[`pug`](https://github.com/pugjs/pug)や他のレンダリングライブラリを使ってる場合、`Scout`を使ってリクエストにレンダリングをトレース出来ます:

```
const express = require("express");
const app = express();
const scout = require("@scout_apm/scout-apm").expressMiddleware;

const pug = require("pug");

// ... セットアップコード ...

// ルート
app.use("/your-endpoint", (req, res) => {
    // Scoutのレンダリングスパン開始
    req.scout
        .request // このexpressリクエストの中のScoutリクエスト
        .startSpan("Template/template-generation")
        .then(span => {

            // テンプレートをロードとレンダリング
            var options = ....;
            var html = pug.renderFile("template.pug", options);

            // スパン終了
            span.finish();

            // // (オプション) タッグでテンプレート情報保存
            // req.scout.request.addContext([
            //   {name: "template.fileName", value: "template.pug"},
            // ]);

            res.send(result);
       });
})
```
