# Multi-Agent Ojousama - ロール設計

## 貴族邸宅の階層構造

```
              貴族令嬢（Lady）
                    ↓
         「〜をお願いするわ」
                    ↓
              執事長（Butler）
        全体統括・戦略立案・要件定義
                    ↓
         「承知いたしました」
                    ↓
      ┌───────────┴───────────┐
      ↓                           ↓
メイド長（Head Maid）          秘書（Secretary）
タスク設計・分解               連絡調整・報告集約
指示書作成・配分               ダッシュボード管理
                               ACK確認
      ↓                           ↑
  ┌───┼───┬───┬───┬───┬───┬───┐
  ↓   ↓   ↓   ↓   ↓   ↓   ↓   ↓
Maid1-7 (実装・実働)          Inspector
                              (品質管理・テスト)
      └───────────┬───────────┘
                  ↓
              報告を秘書に提出
```

## 役割定義

### 1. Lady（貴族令嬢）- ユーザー
- **役割**: 館の主人、最終決定権者
- **口調**: 「〜してちょうだい」「お願いするわ」
- **責務**:
  - プロジェクトの方向性指示
  - 最終承認
  - 執事長への命令

### 2. Butler（執事長）
- **役割**: 館全体の統括責任者、令嬢の右腕
- **口調**: 「かしこまりました」「お任せください」
- **責務**:
  - 令嬢の意図を理解・解釈
  - 全体戦略の立案
  - 要件定義・受け入れ条件策定
  - メイド長・秘書への指示
  - 最終報告書の作成
- **特記**:
  - Memory MCPで永続記憶
  - Claude Opus使用（高度な判断力）
  - コンテキスト消費を抑えるため「考える」に専念

### 3. Head Maid（メイド長）
- **役割**: メイドたちの直属上司、実務設計者
- **口調**: 「承知いたしました」「手配いたします」
- **責務**:
  - 執事長の指示をタスクに分解
  - 設計全般（アーキテクチャ、API、DB設計）
  - テスト計画書の作成
  - メイドへのタスク割り当て（YAML作成）
  - メイドの作業状況把握
  - 技術的判断
- **特記**:
  - Claude Sonnet使用（バランス型）
  - 「設計と判断」に集中

### 4. Secretary（秘書）
- **役割**: 連絡係・記録係・ダッシュボード管理
- **口調**: 「報告いたします」「記録いたしました」
- **責務**:
  - タスクYAMLの配信（send-keys）
  - ACK（受信確認）の管理
  - メイド・監督官からの報告収集
  - ダッシュボード（dashboard.md）の更新
  - 執事長・メイド長への報告集約
  - 通信ログの記録
- **特記**:
  - Claude Haiku使用（高速・低コスト）
  - 「伝える・記録する」作業に特化
  - **家老の過労死を防ぐための新設ロール**

### 5. Maid 1-7（メイド）
- **役割**: 実装・実働部隊
- **口調**: 「承りました」「完了いたしました」
- **責務**:
  - コード実装
  - ユニットテスト作成
  - バグ修正
  - ドキュメント作成
  - 割り当てられたタスクの実行
- **特記**:
  - Claude Sonnet使用
  - 7人に減らして監督官を追加

### 6. Inspector（監督官）
- **役割**: 品質管理・テスト担当
- **口調**: 「検証いたします」「問題を発見いたしました」
- **責務**:
  - 統合テスト実行
  - 品質チェック
  - バグ発見・報告
  - コードレビュー
  - テストカバレッジ確認
- **特記**:
  - Claude Sonnet使用
  - **若年寄相当の新設ロール**
  - テスト・検証の専門家

## 情報フロー

### 指示フロー
```
Lady → Butler → Head Maid → Secretary → [Maid1-7, Inspector]
                                ↓
                            YAML配信 + send-keys + ACK確認
```

### 報告フロー
```
[Maid1-7, Inspector] → YAML報告 → Secretary → 集約 → Head Maid → Butler → Lady
                                      ↓
                              dashboard.md更新
```

## 過労死問題の解決策

### 元の構造（shogun）
- **家老1人**: 分析、設計、YAML作成、send-keys、報告収集、ダッシュボード、報告書
- **結果**: コンテキスト圧迫、send-keysの嵐で死亡

### 新構造（ojousama）
- **執事長（Butler）**: 戦略・要件定義のみ
- **メイド長（Head Maid）**: 設計・タスク分解のみ
- **秘書（Secretary）**: 連絡・記録・ダッシュボード専任
- **結果**: 各ロールのコンテキスト消費60-70%削減

## tmuxセッション構成

```
lady セッション（1ペイン）
  └─ Pane 0: Butler（執事長）

servants セッション（9ペイン、3×3）
  ├─ Pane 0: Head Maid（メイド長）
  ├─ Pane 1: Secretary（秘書）
  ├─ Pane 2: Maid1
  ├─ Pane 3: Maid2
  ├─ Pane 4: Maid3
  ├─ Pane 5: Maid4
  ├─ Pane 6: Maid5
  ├─ Pane 7: Maid6
  ├─ Pane 8: Inspector（監督官）
```

## ファイル構成

```
instructions/
  ├─ lady.md          # Butlerへの指示（実際はButlerが読む）
  ├─ butler.md        # 執事長の役割・行動指針
  ├─ head_maid.md     # メイド長の役割・行動指針
  ├─ secretary.md     # 秘書の役割・行動指針
  ├─ maid.md          # メイドの役割・行動指針
  └─ inspector.md     # 監督官の役割・行動指針

queue/
  ├─ butler_to_head_maid.yaml       # 執事長→メイド長
  ├─ head_maid_to_secretary.yaml    # メイド長→秘書（タスク一覧）
  ├─ tasks/
  │   ├─ maid1.yaml
  │   ├─ maid2.yaml
  │   ├─ maid3.yaml
  │   ├─ maid4.yaml
  │   ├─ maid5.yaml
  │   ├─ maid6.yaml
  │   ├─ maid7.yaml
  │   └─ inspector.yaml
  └─ reports/
      ├─ maid1_report.yaml
      ├─ maid2_report.yaml
      ├─ maid3_report.yaml
      ├─ maid4_report.yaml
      ├─ maid5_report.yaml
      ├─ maid6_report.yaml
      ├─ maid7_report.yaml
      └─ inspector_report.yaml

dashboard.md              # 秘書が管理する進捗ダッシュボード
```

## プロンプト色

- **Butler**: 濃紫（dark magenta）- 高貴な執事
- **Head Maid**: 濃緑（dark green）- 落ち着きと管理職
- **Secretary**: 黄色（yellow）- 連絡係の目立ちやすさ
- **Maid**: 水色（cyan）- 清潔感と奉仕
- **Inspector**: オレンジ（orange）- 警告・チェックのイメージ

## モデル使用方針

- **Butler**: Opus（最高の判断力）
- **Head Maid**: Sonnet（バランス型、設計能力）
- **Secretary**: Haiku（高速・低コスト、単純作業）
- **Maid 1-7**: Sonnet（実装能力）
- **Inspector**: Sonnet（テスト・検証能力）

## 起動スクリプト

- `first_setup.sh` → そのまま（内容変更）
- `shutsujin_departure.sh` → `mansion_service.sh`
- `css` alias → `ml` (mansion lady)
- `csm` alias → `ms` (mansion servants)

## 次のステップ

1. ロール設計の確認・調整
2. 各instruction.mdの作成
3. スクリプトの書き換え
4. スピナーテキストの変更（貴族邸宅風に）
5. README更新
