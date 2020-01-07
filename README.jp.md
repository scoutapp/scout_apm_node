# Scout APM NodeJS クライアント #

[Scout](https://www.scoutapp.com)はNodeJSのアプリのパーフォーマンすを監視するツールです。インストールするとメトリック、リクエスト速度、トランスアクションのデータを`scout-apm-client`で収集して、文責出来ます。

## 必須

[NodeJS](https://nodejs.org) バージョン:
- 10+

Scout APM は下記に書いてあるフレームワークと簡単に使えます:
- [ExpressJS](https://expressjs.com) 4.x

## セットアップ

__Scoutのアカウントが必要です。[Scoutサインアップ](https://apm.scoutapp.com/users/sign_up).__

## インストール

`npm`で`scout-apm-client`をインストール出来ます:

```shell
$ npm install scout-apm-client
```

## `scout-apm-client` と [`express`](https://expressjs.com/)

Scoutは`express`のアプリケーションミドルウェアでと簡単にリクエストをトレース出来ます:

```javascript
const express = require("express");
const app = express();
const scout = require("scout-apm-client").expressMiddleware;

// ミドルウェアをインストール
app.use(scout());

// ルート設定
app.get('/', function (req, res) {
  res.send('hello, world!')
})
```

設定についての情報は`docs/configuration.md`に書いてます。

## 他のフレームワークやライブラリーと`scout-apm-client` ##

他のフレームワークやライブラリーをトレースするために`Promise`のAPIが使えます:

```javascript
const Scout = require("scout-apm-client").Scout;
const scout = new Scout();

// Scoutオブジェクトのセットアップ
scout.setup()
    .then(scout => {
        // リクエスト開始
        return scout.startRequest()
            .then(scoutRequest => {
                // タスク実行
                return bigHeavyTaskThatReturnsAPromise()
                    // リクエスト終了
                    .then(() => scoutRequest.finishAndSend());
            });
    });
});
```

他の実例は`docs/cookbook.md`に書いてます。
アーキテクチャについて `docs/architecture.md`をご覧になってください。

## 開発

`scout-apm-client`を開発したい方は,下記に書いてるコマンドを実行してください:

```shell
$ make dev-setup
```

実行すると開発ための環境が作られます。`git`のフックや他の開発に便利なものはインストールされます。

`Makefile`に開発してる時に便利なコマンドも含めています:

```
$ make lint # tslint実行
$ make lint-watch # 継続的にtslint実行

$ make build # tsc(タイプスクリプトのコンパイラ)実行
$ make build-watch # 継続的にtsc実行
```

開発について`docs/development.md`をご覧になってください。

## 寄付 / 開発応援

`scout-apm-client`の開発に参加手引き:

0. リポジトリーをクローン(`git clone`)
1. `make dev-setup` でローカル環境セットアップ
2. `make build` でプロジェクトをビルド
3. コードを書く
4. `make test`でテスト実行(テストについては`docs/tests.md`を読んでください)
5. PR(プールリクエスト)を作る

## ドキュメント

インストールとかトラブルシューティングのドキュメントは[Scoutのヘルプサイ](http://help.apm.scoutapp.com/#nodejs-client)にあります。

## サポート

`scout-apm-client`に問題が発生したら:

- [issueを作成してください](https://github.com/scoutapp/scout_apm_node/issues/new)
- メールでScoutを連絡してください: [support@scoutapp.com](mailto://support@scoutapp.com)
