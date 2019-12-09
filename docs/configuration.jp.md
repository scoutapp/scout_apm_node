# 設定 #

Scoutのクライアントの設定は様々の方法で設定出来ます:

- 設定ファイル (`scout.yaml`)
- アプリケーション内(`ScoutConfiguration`)
- 環境バリアブル

設定ファイルについては[Scoutのヘルプドキュメント](https://docs.scoutapm.com/)をご参照してください。

## アプリ内のクライアント設定 ##

デフォルトの設定方法の上に`Scout`のオブジェクトとコードの設定オブジェクトを使えます:

```typescript
class ScoutConfiguration {
    // アプリのデータ
    public readonly name: string = "";
    public readonly key: string = "";
    public readonly revisionSHA: string = "";

    // 実行設定
    public readonly logLevel: LogLevel = LogLevel.Info;
    public readonly logFilePath: "stdout" | string = "stdout";
    public readonly httpProxy?: string;
    public readonly allowShutdown: boolean = false;

    // エージェント設定
    public readonly agentVersion: string = "1.1.8";
    public readonly apiVersion: string = "1.0";

    // 機械設定
    public readonly hostname: string = hostname();

    // トレース設定
    public readonly ignoredRoutePrefixes: string[] = [];
    public readonly collectRemoteIP: boolean = true;
    public readonly uriReportingLevel: URIReportingLevel = URIReportingLevel.FilteredParams;
}
```
| Value                  | Type                | Default             | Description                                                                                                       |
|------------------------|---------------------|---------------------|-------------------------------------------------------------------------------------------------------------------|
| `name`                 | `string`            | ""                  | アプリ名                                                                                                          |
| `key`                  | `string`            | ""                  | Scoutのキー ([ScoutのAPMのダッシュボード](https://apm.scoutapp.com/home)にあります)                               |
| `revisionSHA`          | `string`            | ""                  | アプリコードのSHAハッシュ                                                                                         |
| `logLevel`             | `LogLevel`          | `"info"`            | ログのレベル                                                                                                      |
| `logFilePath`          | `string`            | `"stdout"`          | ログのファイルパス                                                                                                |
| `httpProxy`            | `string`            | `undefined`         | `core-agent`連系のHTTPプロクシー                                                                                  |
| `agentVersion`         | `string`            | `"1.1.8"`           | エージェントのバージョン                                                                                          |
| `apiVersion`           | `string`            | `"1.0"`             | APIのバージョン                                                                                                   |
| `hostname`             | `string`            | `hostname()`        | 機械のホストネーム (付けないと[NodeJSの`os.hostname()`](https://nodejs.org/api/os.html#os_os_hostname)になります) |
| `ignoredRoutePrefixes` | `string[]`          | `[]`                | 無視するルート接頭                                                                                                |
| `collectRemoteIP`      | `boolean`           | `true`              | リクエストIPを保存する                                                                                            |
| `uriReportingLevel`    | `URIReportingLevel` | `"filtered-params"` | URIのログレベル                                                                                                   |


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

## プラグイン ##

Scoutは様々欲使われてるライブラリやフレームワークのプラグインを提供しております。設定情報はプラグイン毎のドキュメントを参照してください。

### ExpressJS ###

ExpressJSのプラグインについては`docs/integrations/express.md`をご参照してください。
