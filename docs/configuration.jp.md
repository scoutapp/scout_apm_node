# 設定 #

Scoutのクライアントの設定は様々の方法で設定出来ます:

- 環境バリアブル
- アプリケーション内(`ScoutConfiguration`)
- デフォルト

設定ファイルについては[Scoutのヘルプドキュメント](https://docs.scoutapm.com/)をご参照してください。

## アプリ内のクライアント設定 ##

デフォルトの設定方法の上に`Scout`のオブジェクトとコードの設定オブジェクトを使えます:

```typescript
class ScoutConfiguration {
    // アプリのデータ
    name: string;
    key: string;
    revisionSHA: string;
    appServer: string;
    applicationRoot: string;
    scmSubdirectory: string;

    // 実行設定
    logLevel: LogLevel;
    logFilePath: "stdout" | string;
    socketPath: string;
    httpProxy: string;
    monitor: boolean;

    // フレームワーク設定
    framework: string;
    frameworkVersion: string;

    // ダウンロード設定
    apiVersion: string;
    downloadUrl: string;

    // エージェント設定
    coreAgentDownload: boolean;
    coreAgentLaunch: boolean;
    coreAgentDir: string;
    coreAgentLogLevel: LogLevel;
    coreAgentPermissions: number;
    coreAgentVersion: string;

    // 機械設定
    hostname: string | null;

    // トレース設定
    ignore: string[]; // ignored route prefixes
    collectRemoteIP: boolean;
    uriReporting: URIReportingLevel;

    // その他
    disabledInstruments: string[];

}
```
| Value                  | Type                | Default                                                                              | Description                                                                                                       |
|------------------------|---------------------|--------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| `name`                 | `string`            | ""                                                                                   | アプリ名                                                                                                          |
| `key`                  | `string`            | ""                                                                                   | Scoutのキー ([ScoutのAPMのダッシュボード](https://apm.scoutapp.com/home)にあります)                               |
| `revisionSHA`          | `string`            | ""                                                                                   | アプリコードのSHAハッシュ                                                                                         |
| `appServer`            | `string`            | ""                                                                                   | アプリケーションサーバー名                                                                                        |
| `applicationRoot`      | `string`            | ""                                                                                   | アプリケーションのルート                                                                                          |
| `scmSubdirectory`      | `string`            | ""                                                                                   | ソースコード管理ツールのサブディレクトリー名                                                                      |
| `logLevel`             | `LogLevel`          | `"info"`                                                                             | ログのレベル                                                                                                      |
| `logFilePath`          | `string`            | `"stdout"`                                                                           | ログのファイルパス                                                                                                |
| `socketPath`           | `string`            | `"/tmp/scout_apm_core"`                                                              | `core-agent`が使えるソケットのファイルパス                                                                        |
| `httpProxy`            | `string`            | `undefined`                                                                          | `core-agent`連系のHTTPプロクシー                                                                                  |
| `monitor`              | `boolean`           | `false`                                                                              | モニタリング実効設定                                                                                              |
| `framework`            | `string`            | `""`                                                                                 | アプリケーションのフレームワーク名                                                                                |
| `frameworkVersion`     | `string`            | `""`                                                                                 | アプリケーションのフレームワークバージョン                                                                        |
| `agentVersion`         | `string`            | `"1.1.8"`                                                                            | エージェントのバージョン                                                                                          |
| `apiVersion`           | `string`            | `"1.0"`                                                                              | APIのバージョン                                                                                                   |
| `downloadUrl`          | `string`            | `"https://s3-us-west-1.amazonaws.com/scout-public-downloads/apm_core_agent/release"` | ダウンロードURL                                                                                                   |
| `coreAgentDownload`    | `boolean`           | `true`                                                                               | `core-agent`のバイナリダウンロード許可                                                                            |
| `coreAgentLaunch`      | `boolean`           | `true`                                                                               | `core-agent`のバイナリローウンチ許可                                                                              |
| `coreAgentDir`         | `string`            | `"/tmp/scout_apm_core"`                                                              | `core-agent`が使うディレクトリー                                                                                  |
| `coreAgentLogLevel`    | `LogLevel`          | `"info"`                                                                             | `core-agent`に設定するログのレベル                                                                                |
| `coreAgentPermissions` | `string[]`          | `[]`                                                                                 | `core-agent`に設定する許可リスト                                                                                  |
| `coreAgentVersion`     | `string`            | `"1.1.8"`                                                                            | `core-agent`のバージョン                                                                                          |
| `hostname`             | `string`            | `hostname()`                                                                         | 機械のホストネーム (付けないと[NodeJSの`os.hostname()`](https://nodejs.org/api/os.html#os_os_hostname)になります) |
| `ignore`               | `string[]`          | `[]`                                                                                 | 無視するルート接頭                                                                                                |
| `collectRemoteIP`      | `boolean`           | `true`                                                                               | リクエストIPを保存する                                                                                            |
| `uriReportingLevel`    | `URIReportingLevel` | `"filtered-params"`                                                                  | URIのログレベル                                                                                                   |
| `disabledInstruments`  | `string[]`          | `[]`                                                                                 | 無効された計器                                                                                                    |

`LogLevel`は下記に書いてあるインターフェース:

```typescript
enum LogLevel {
    Info = "info",
    Warn = "warn",
    Debug = "debug",
    Trace = "trace",
    Error = "error",
}
```

`URIReportingLevel`s は下記にかいてあるインターフェース:

```typescript
enum URIReportingLevel {
    FilteredParams = "filtered-params",
    PathOnly = "path-only",
}
```

## オーバーライド仕組み ##

同時に環境バリアブルとアプリ内のバリューを設定する場合には、一番リストに早い方の勝ちです。

例えば、設定状況が以下の場合:

- 環境バリアブルの`SCOUT_NAME`を`my-app-from-env`にセットしました。
- `Partial<ScoutConfiguration>` のオブジェクトを`{name: "my-app-from-app"}`にして、アプリ内に使う (例 `new Scout(buildScoutConfiguration({name: "my-app-from-app"}))`)
- (`name`のデフォルトは`""`)

Scoutのエージェントの`name`は`"my-app-from-env"`になります。環境バリアブルの方がアプリ内の設定とデフォルトバリューをオーバーライドします。

## プラグイン ##

Scoutは様々欲使われてるライブラリやフレームワークのプラグインを提供しております。設定情報はプラグイン毎のドキュメントを参照してください。

### ExpressJS ###

ExpressJSのプラグインについては`docs/integrations/express.md`をご参照してください。
