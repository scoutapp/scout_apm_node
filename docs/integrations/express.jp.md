# ExpressJS プラグイン #

Scoutは人気の[ExpressJS](https://expressjs.com)と簡単に使えます。アプリのミドルウェアで全リクエストをトレース出来ます。

## 利用方法 ##

ExpressJSのアプリとScoutのミドルウェア実装:

```javascript
const express = require("express");
const app = express();
const scout = require("@scout_apm/scout-apm").expressMiddleware;

// ミドルウェアインストール
app.use(scout());

// ルート設定
app.get('/', function (req, res) {
  res.send('hello, world!')
})
```

## 設定 ##

ExpressJSのプラグインの設定のインターフェースは下記に書いてます:

```typescript
interface ExpressMiddlewareOptions {
    config?: ScoutConfiguration;
    requestTimeoutMs?: number;
    logFn?: LogFn;
}
```

| 設定               | タイプ               | デフォルト | 説明                               |
|--------------------|----------------------|------------|------------------------------------|
| `config`           | `ScoutConfiguration` | N/A        | Scoutのエージェント設定            |
| `requestTimeoutMs` | `number`             | `300000`   | グローバルのリクエストタイムアウト |
| `logFn`            | `LogFn`              | N/A        | ログのファンクション               |

## 実装説明 ##

Scoutのミドルウェアは全リクエストをトレースするように設定してます。アプリ内の`app`のオブジェクト (`express.Application`) に`Scout`のインスタンスを自動で追加されます(`app.scout`) 。

リクエスト内の`req` (`express.Request`) オブジェクトに`scout`と言うオブジェクトが追加されます(`req.scout`)。`req.scout`通じてリクエストとルートスパンがアクセス出来ます(`req.scout.request`と`req.scout.rootSpan`)。

ExpressJSのリクエストトレースは必ず一つの`Controller/<METHOD> <ROUTE>`の名前のスパンがあります。`METHOD`はルートのHTTPメソッド (GET, POST, PUT, etc)と`ROUTE`はリクエストのルートです(例`users/:id`)。

## トレースの追加とタグ方法 ##

リクエストのトレースにスパンを追加したい場合、`req.scout.rootSpan`か`req.scout.request`の`addSpan`や`tagSpan`や`tagRequest`を使って下さい.
