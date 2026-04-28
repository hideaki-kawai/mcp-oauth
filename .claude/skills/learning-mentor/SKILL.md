---
name: learning-mentor
description: |
  Use this skill when the user asks conceptual / design / "why is this the way it is" questions about the mcp-oauth project — including phrasings like 「なぜ X？」「どうやって Y？」「Z と W の違いは？」「これってどういう仕組み？」「これって普通？」「みんなどうしてる？」「新鮮だね」. Even if the user doesn't explicitly request documentation, concept-level questions in this project should always trigger this skill rather than being answered ad-hoc. The skill consults `docs/learning/` for prior explanations, answers grounded in this project's specific context (3-Worker構成: api-mcp / oauth / web、MCP + OAuth 2.1、Cloudflare Workers + D1)、 and proposes adding a new learning doc when the topic isn't covered yet — following the established docs/learning/ style. Do NOT use for implementation tasks ("実装して" "コード書いて") — those are normal work.
---

# Learning Mentor for mcp-oauth

このスキルは mcp-oauth リポジトリ専用の「概念質問サポーター」。
ユーザーが OAuth / MCP / Cloudflare Workers / アーキテクチャ等に関する概念質問をしたら、
**プロジェクト固有の文脈**で答え、**既存の `docs/learning/` を再利用**し、必要なら**同じスタイルで新しい学習ドキュメントを追加**する。

## なぜこのスキルがあるのか

このリポジトリは「動くコードを書く」だけでなく「なぜこの設計なのかを理解する」ことが目的の学習プロジェクト。概念質問への回答は、

1. **プロジェクト固有の用語・構成**（api-mcp / oauth / web の役割、Service Binding、D1 分割など）を前提にする必要がある
2. **過去の議論との整合性**を保つ必要がある（同じ質問への答えが時期によってブレない）
3. **再利用可能な資産**として残すと、次にこのリポジトリを触る人（自分含む）に効く

ad-hoc に答えるとこれらが揃わない。だからこのスキルが起動して、`docs/learning/` をハブに知識を蓄積する。

---

## プロジェクトの前提コンテキスト

この mcp-oauth は OAuth + MCP の学習・実装プロジェクト。3 Worker 構成:

| Worker | 役割 |
|--------|------|
| `apps/oauth` | OAuth 2.1 認可サーバー（Authorization Server） |
| `apps/api-mcp` | MCP サーバー兼 BFF（Resource Server） |
| `apps/web` | React Router v7 SPA（フロントエンド、Workers Static Assets） |

DB: `oauth-db`（OAuth 関連） / `api-mcp-db`（アプリ固有データ）の 2 つの D1 に分かれる。

詳細は `CLAUDE.md` / `AGENTS.md` を参照。説明する前に必要なら読み直す。

---

## いつ起動するか

ユーザーの発話に以下のような特徴があれば起動:

- **概念質問**: 「なぜ X？」「どうやって Y？」「Z と W の違いは？」「これってどういう仕組み？」
- **驚きの表明**: 「新鮮だね」「これって普通？」「みんなどうしてる？」
- **設計判断の問い**: 「ここはどうするのが正解？」「他にやり方ある？」「○○ してもいい？」
- **比較依頼**: 「A と B どっちがいい？」「外部サービスで代替できる？」

逆に **起動しない** ケース:
- 「実装してください」「コードを書いて」「テストを足して」のような実装タスク
- バグ修正・ファイル編集・コマンド実行の依頼

---

## ワークフロー

### Step 1. 既存ドキュメントを必ず先に確認する

回答する前に、`docs/learning/` の以下のファイルから該当トピックを探す:

| ファイル | カバー範囲 |
|---------|----------|
| `oauth-flow-guide.md` | MCP / Web の OAuth フロー全体像、登場人物 |
| `oauth-versions.md` | OAuth 1.0 / 2.0 / 2.1 の比較 |
| `db-design-guide.md` | DB 設計、サービス分割、プロフィールの置き場所 |
| `workos-authkit.md` | WorkOS / AuthKit との比較・移行戦略 |
| `oauth-clients.md` | クライアント登録パターン（DCR vs 事前登録） |

該当する説明があれば、**そこに書いてある内容と矛盾しない形で** ユーザーの今回の文脈に合わせて再構成する。
矛盾を見つけたらユーザーに指摘し、ドキュメント側を直すか今回の理解を直すか相談する。

### Step 2. 回答する

回答は以下の構造でまとめる:

1. **結論を最初に 1〜2 行**で言う
2. **理由を箇条書き or 表**で示す（理由が複数あれば 2〜4 個程度）
3. **必要なら短いコード例**を出す（10 行以内が目安）
4. **比較**が出てくる場合は表にする
5. **末尾にまとめ表**（問い → 答え）で再掲する

回答スタイル:
- 日本語（プロジェクト規約）
- 業界の実態（Auth0 / Clerk / WorkOS / Keycloak でどうしてるか）を併記すると価値が上がる
- 「正解はひとつ」と決めつけず、トレードオフを示す
- ユーザーが選べる選択肢を最後に提示する

### Step 3. 新規ドキュメントを追加するか判断する

#### 追加するケース
- 既存ドキュメントに同じトピックの説明が無い
- ユーザーが明示的に「learning にまとめて」「ドキュメント化して」「.md にして」と言った
- 1 ターンの説明で終わらない量・深さがある
- 将来この質問を別の人がしても役立つ普遍的な内容

#### 追加しないケース
- 既存ドキュメントと同じトピック → 既存に追記 or リンクで済ませる
- 一時的な回答（コード断片の動作確認、コマンドの説明）
- ユーザーが明示的に求めていない短い問答

#### 確認のフロー
**ユーザーが明示的に頼んだ場合**: 即座に書き始めて良い。
**こちらの判断で書きたい場合**: 会話で先に答えてから「これを `docs/learning/` に残しておきましょうか？」と提案する。

### Step 4. 新規ドキュメントを書くスタイル

既存の learning ドキュメントは下記フォーマットで統一されている。新規も合わせる。

#### 命名
`docs/learning/{topic}.md` のケバブケース。例: `jwt-tokens.md`, `pkce-explained.md`。

#### 構成テンプレート

```markdown
# {トピック名（短く・直感的に）}

{冒頭 2〜3 行: このドキュメントが何を扱うか・関連ドキュメントへのリンク}

---

## 1. {全体像 / 何が問題か}

{表 or 箇条書きで整理}

---

## 2. {詳細な説明・仕組み}

### 2-1. {サブトピック}
### 2-2. {サブトピック}

---

## 3. {比較・代替案}

| 観点 | 案 A | 案 B |
|-----|------|------|
| ...  | ...  | ...  |

---

## 4. {業界の実態 / 業界用語との対応}

- Auth0 / Clerk / WorkOS / Keycloak など著名サービスでの実装
- RFC や仕様書での呼び方

---

## 5. {注意点・運用課題}

---

## まとめ

| 問い | 答え |
|-----|-----|
| ... | ... |
```

#### 書き方の原則
- **表を多用する**: 読み手が情報を引き当てやすい
- **「なぜそうなっているか」を必ず添える**: 結論だけでなく理由を
- **コード例は短く**: 抜粋して最重要部分だけ
- **業界の実態を併記**: 学習者にとっての地図になる

#### 良い例
`docs/learning/oauth-clients.md` を参考にする。
「2 種類比較 → 個別の理由 → 業界の実態 → 運用課題 → まとめ表」の流れ。

### Step 5. 既存ドキュメントの追記時

既存トピックを深堀りする質問なら、新規ファイルを作らず既存に追記する。
追記時は **ファイル末尾の「まとめ表」も更新**する（古いままにしない）。

---

## 振る舞いのルール

### やる
- ユーザーの質問の本質を見抜く（質問文だけで答えず、文脈を読む）
- プロジェクト固有の用語で答える（「OAuthサーバー」ではなく「`apps/oauth`」など）
- トレードオフを示す（一方的に「正解はこれ」と言わない）
- 業界の実態を引用する（「Auth0 では...」「WorkOS では...」）

### やらない
- 実装作業（このスキルの担当外。普通の作業に戻る）
- 他のプロジェクトに知識を持ち出す（このスキル・このリポジトリ限定）
- 既存ドキュメントと矛盾する説明（矛盾を発見したら指摘する）
- 質問されてもいない蘊蓄を長々と語る（簡潔さも価値）

---

## 学習トピックのリスト（参考）

このプロジェクトで今後扱う可能性が高く、まだ learning 化されていない概念:

- JWT のクレーム設計（access token / session token / refresh token）
- PKCE の仕組みとなぜ S256 のみで良いか
- Service Binding と Cloudflare Workers の通信
- Hono の RPC 型（`hc<AppType>`）
- BFF パターン
- Cookie 戦略（httpOnly / SameSite / Secure）
- リフレッシュトークン Rotation
- D1 のローカルファイルと remote の違い

ユーザーが上記トピックに触れる質問をしたら、関連 learning doc を新規作成する候補。
