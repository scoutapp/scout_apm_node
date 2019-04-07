# テスト #

`scout-apm-client`に含めているテストを全部実行したい場合:

```shell
$ make test
```

## ユニットテスト ##

ユニットテストだけ実行した場合:

```shell
$ make test-unit
```

## インテグレーションテスト ##

インテグレーションテストだけ実行した場合:

```shell
$ make test-int
```

## エンドツーエンドテスト ##

エンドツーエンドテストだけ実行した場合:

```shell
$ TEST_AGENT_KEY=<key> make test-e2e
```

`core-agent`はScoutのAPIまでにリクエストしますので`TEST_AGENT_KEY`と言う環境バリアブルは必須になってます。 便利な環境バリアブル設定方法を使いたいなら、[`direnv`](https://direnv.net/)を使って`.envrc`ファイルを作って下さい。

## エージェントのマニュアルテスト ##

直接エージェントまでメセージを送りたい場合、ビルド後`node`のコンソールを使って下さい:

```nodejs
$ node
> const ExternalProcessAgent = require("./dist/lib/agents/external-process.js").default;
> const agent = new ExternalProcessAgent({binPath: "", uri: "file:///path/to/core-agent.sock"});
> agent.connect().then(console.log)
# プロミスのリターンと{connected: true}
```

リクエストを送る(例 `V1GetVersionRequest`):

```nodejs
> const R = require("./dist/lib/protocol/v1/requests")
> agent.send(new R.V1GetVersionRequest()).then(console.log)
< V1GetVersionResponse {
<   type: 'v1-get-version-response',
<   version: CoreAgentVersion { raw: '1.1.8' },
<   result: 'Success' }
```

アプリ登録リクエスト:

```nodejs
> let req = new R.V1Register("your-manual-app-name", "<your scout key>", "1.0");
> agent.send(req).then(console.log);
< V1RegisterResponse { type: 'v1-register-response', result: 'Success' }
```

登録後トレースのリクエストを送れます。`core-agent`はバッファーを使ってますので、大体2分後で[the scout dashboard](https://apm.scoutapp.com/home)でトレースを見えます。テスト内`TestUtil.waitForAgentBufferFlush`を使って、ウェート出来ます。
