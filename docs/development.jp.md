# 開発 #

`scout-apm-client`開発についてのドキュメント。

## タイプスクリプト ##

`scout-apm-client`のコードベースは[タイプスクリプト](https://www.typescriptlang.org/)で書いてます。コードベースのタイプスクリプトのサンプル使ってちょっとだけ手引きが下記に書いてます:

```typescript
// ストリングのenum
// 例 LogLevel.Info
enum LogLevel {
    Info = "info",
    Warn = "warn",
    Debug = "debug",
    Trace = "trace",
    Error = "error",
}

// 合計タイプ (互いに素な連合)
type JSONValue = object | string | number;

// ApplicationMetadataのクラスは下記に書いてあるのキーを持ってるオブジェクト
// serverTimeとframeworkはオプションになってます。
// 全キーはパブリックで読み取り専用になってます。
class ApplicationMetadata {
    public readonly language: string;
    public readonly version: string;
    public readonly serverTime?: string;
    public readonly framework?: string;
}

// ファンクションを書く時にインプットとアウトプットのタイプを書けます。
function consoleLogFn(message: string, level?: LogLevel): string {
    level = level || LogLevel.Info;
    ....
    return message;
}

// ファンクションのアウトプットとして、タイプのヒントが出来ます。
function isSuccessfulResponseResult(obj: any): obj is AgentResponseSuccessResult {
    return obj && typeof obj === "string" && obj === "Success";
}
```

タイプスクリプトでのコードは`dist`のフォルダーに入れられます。コンパイラの設定は`tsconfig.json`に書いております。

タイプスクリプトの公式ドキュメントをご参照して下さい。[Typescript in 5 minutes](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html).
