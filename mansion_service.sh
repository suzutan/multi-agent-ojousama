#!/bin/bash
# 🏛️ multi-agent-mansion 勤務開始スクリプト（毎日の起動用）
# Daily Service Script for Multi-Agent Orchestration System
#
# 使用方法:
#   ./mansion_service.sh           # 全エージェント起動（通常）
#   ./mansion_service.sh -s        # セットアップのみ（Claude起動なし）
#   ./mansion_service.sh -h        # ヘルプ表示

set -e

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 言語設定を読み取り（デフォルト: ja）
LANG_SETTING="ja"
if [ -f "./config/settings.yaml" ]; then
    LANG_SETTING=$(grep "^language:" ./config/settings.yaml 2>/dev/null | awk '{print $2}' || echo "ja")
fi

# シェル設定を読み取り（デフォルト: zsh）
SHELL_SETTING="zsh"
if [ -f "./config/settings.yaml" ]; then
    SHELL_SETTING=$(grep "^shell:" ./config/settings.yaml 2>/dev/null | awk '{print $2}' || echo "zsh")
fi

# API Provider 設定を読み取り（デフォルト: anthropic）
# bedrock: 全員Sonnet、anthropic: shogun方式、codex: gpt-5.2系
API_PROVIDER="anthropic"
if [ -f "./config/settings.yaml" ]; then
    API_PROVIDER=$(grep "^api_provider:" ./config/settings.yaml 2>/dev/null | awk '{print $2}' || echo "anthropic")
fi

# モデル設定（環境変数がない場合のデフォルト値: sonnet, haiku）
MODEL_SONNET="${ANTHROPIC_MODEL_SONNET:-sonnet}"
MODEL_HAIKU="${ANTHROPIC_MODEL_HAIKU:-haiku}"

# 色付きログ関数（貴族邸宅風）
log_info() {
    echo -e "\033[1;33m【報】\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m【成】\033[0m $1"
}

log_service() {
    echo -e "\033[1;35m【執】\033[0m $1"
}

# ═══════════════════════════════════════════════════════════════════════════════
# プロンプト生成関数（bash/zsh対応）
# ───────────────────────────────────────────────────────────────────────────────
# 使用法: generate_prompt "ラベル" "色" "シェル"
# 色: red, green, blue, magenta, cyan, yellow, orange, dark_green, dark_magenta
# ═══════════════════════════════════════════════════════════════════════════════
generate_prompt() {
    local label="$1"
    local color="$2"
    local shell_type="$3"

    if [ "$shell_type" == "zsh" ]; then
        # zsh用: %F{color}%B...%b%f 形式
        case "$color" in
            dark_magenta) echo "(%F{magenta}%B${label}%b%f) %F{green}%B%~%b%f%# " ;;
            dark_green)   echo "(%F{green}%B${label}%b%f) %F{green}%B%~%b%f%# " ;;
            orange)       echo "(%F{yellow}%B${label}%b%f) %F{green}%B%~%b%f%# " ;;
            *)            echo "(%F{${color}}%B${label}%b%f) %F{green}%B%~%b%f%# " ;;
        esac
    else
        # bash用: \[\033[...m\] 形式
        local color_code
        case "$color" in
            dark_magenta) color_code="0;35" ;;  # 濃紫
            dark_green)   color_code="0;32" ;;  # 濃緑
            yellow)       color_code="1;33" ;;  # 黄色
            cyan)         color_code="1;36" ;;  # 水色
            orange)       color_code="0;33" ;;  # オレンジ（茶色で代用）
            red)          color_code="1;31" ;;
            green)        color_code="1;32" ;;
            blue)         color_code="1;34" ;;
            magenta)      color_code="1;35" ;;
            *)            color_code="1;37" ;;  # white (default)
        esac
        echo "(\[\033[${color_code}m\]${label}\[\033[0m\]) \[\033[1;32m\]\w\[\033[0m\]\$ "
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# オプション解析
# ═══════════════════════════════════════════════════════════════════════════════
# AI_PROVIDER のデフォルト値（claude または codex）
AI_PROVIDER="claude"
SETUP_ONLY=false
OPEN_TERMINAL=false
SHELL_OVERRIDE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        claude|codex)
            AI_PROVIDER="$1"
            shift
            ;;
        -s|--setup-only)
            SETUP_ONLY=true
            shift
            ;;
        -t|--terminal)
            OPEN_TERMINAL=true
            shift
            ;;
        -shell|--shell)
            if [[ -n "$2" && "$2" != -* ]]; then
                SHELL_OVERRIDE="$2"
                shift 2
            else
                echo "エラー: -shell オプションには bash または zsh を指定してください"
                exit 1
            fi
            ;;
        -h|--help)
            echo ""
            echo "🏛️ multi-agent-mansion 勤務開始スクリプト"
            echo ""
            echo "使用方法: ./mansion_service.sh [claude|codex] [オプション]"
            echo ""
            echo "引数:"
            echo "  claude              Claude で起動（デフォルト）"
            echo "  codex               OpenAI Codex で起動"
            echo ""
            echo "オプション:"
            echo "  -s, --setup-only    tmuxセッションのセットアップのみ（起動なし）"
            echo "  -t, --terminal      Windows Terminal で新しいタブを開く"
            echo "  -shell, --shell SH  シェルを指定（bash または zsh）"
            echo "                      未指定時は config/settings.yaml の設定を使用"
            echo "  -h, --help          このヘルプを表示"
            echo ""
            echo "例:"
            echo "  ./mansion_service.sh              # 全エージェント起動（通常の勤務開始）"
            echo "  ./mansion_service.sh codex        # Codex で起動"
            echo "  ./mansion_service.sh -s           # セットアップのみ（手動で起動）"
            echo "  ./mansion_service.sh -t           # 全エージェント起動 + ターミナルタブ展開"
            echo "  ./mansion_service.sh -shell bash  # bash用プロンプトで起動"
            echo "  ./mansion_service.sh -shell zsh   # zsh用プロンプトで起動"
            echo ""
            echo "エイリアス:"
            echo "  mst  → cd <path> && ./mansion_service.sh"
            echo "  ml   → tmux attach-session -t lady"
            echo "  ms   → tmux attach-session -t servants"
            echo ""
            exit 0
            ;;
        *)
            echo "不明なオプション: $1"
            echo "./mansion_service.sh -h でヘルプを表示"
            exit 1
            ;;
    esac
done

# シェル設定のオーバーライド（コマンドラインオプション優先）
if [ -n "$SHELL_OVERRIDE" ]; then
    if [[ "$SHELL_OVERRIDE" == "bash" || "$SHELL_OVERRIDE" == "zsh" ]]; then
        SHELL_SETTING="$SHELL_OVERRIDE"
    else
        echo "エラー: -shell オプションには bash または zsh を指定してください（指定値: $SHELL_OVERRIDE）"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 勤務開始バナー表示
# ═══════════════════════════════════════════════════════════════════════════════
show_service_start() {
    clear

    # タイトルバナー（色付き）
    echo ""
    echo -e "\033[1;35m╔══════════════════════════════════════════════════════════════════════════════════╗\033[0m"
    echo -e "\033[1;35m║\033[0m \033[1;33m███╗   ███╗ █████╗ ███╗   ██╗███████╗██╗ ██████╗ ███╗   ██╗\033[0m                \033[1;35m║\033[0m"
    echo -e "\033[1;35m║\033[0m \033[1;33m████╗ ████║██╔══██╗████╗  ██║██╔════╝██║██╔═══██╗████╗  ██║\033[0m                \033[1;35m║\033[0m"
    echo -e "\033[1;35m║\033[0m \033[1;33m██╔████╔██║███████║██╔██╗ ██║███████╗██║██║   ██║██╔██╗ ██║\033[0m                \033[1;35m║\033[0m"
    echo -e "\033[1;35m║\033[0m \033[1;33m██║╚██╔╝██║██╔══██║██║╚██╗██║╚════██║██║██║   ██║██║╚██╗██║\033[0m                \033[1;35m║\033[0m"
    echo -e "\033[1;35m║\033[0m \033[1;33m██║ ╚═╝ ██║██║  ██║██║ ╚████║███████║██║╚██████╔╝██║ ╚████║\033[0m                \033[1;35m║\033[0m"
    echo -e "\033[1;35m║\033[0m \033[1;33m╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝\033[0m                \033[1;35m║\033[0m"
    echo -e "\033[1;35m╠══════════════════════════════════════════════════════════════════════════════════╣\033[0m"
    echo -e "\033[1;35m║\033[0m       \033[1;37m勤務を開始いたします！\033[0m    \033[1;36m👔\033[0m    \033[1;35m至高のサービスを！\033[0m               \033[1;35m║\033[0m"
    echo -e "\033[1;35m╚══════════════════════════════════════════════════════════════════════════════════╝\033[0m"
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # 使用人隊列（オリジナル）
    # ═══════════════════════════════════════════════════════════════════════════
    echo -e "\033[1;34m  ╔═════════════════════════════════════════════════════════════════════════════╗\033[0m"
    echo -e "\033[1;34m  ║\033[0m                    \033[1;37m【 使 用 人 隊 列 ・ 八 名 配 備 】\033[0m                      \033[1;34m║\033[0m"
    echo -e "\033[1;34m  ╚═════════════════════════════════════════════════════════════════════════════╝\033[0m"

    cat << 'SERVANTS_EOF'

       /\      /\      /\      /\      /\      /\      /\      /\
      /||\    /||\    /||\    /||\    /||\    /||\    /||\    /||\
     /_||\   /_||\   /_||\   /_||\   /_||\   /_||\   /_||\   /_||\
       ||      ||      ||      ||      ||      ||      ||      ||
      /||\    /||\    /||\    /||\    /||\    /||\    /||\    /||\
      /  \    /  \    /  \    /  \    /  \    /  \    /  \    /  \
     [M1]    [M2]    [M3]    [M4]    [M5]    [M6]    [M7]    [Ins]

SERVANTS_EOF

    echo -e "                    \033[1;36m「「「 かしこまりました！ 勤務を開始いたします！ 」」」\033[0m"
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # システム情報
    # ═══════════════════════════════════════════════════════════════════════════
    echo -e "\033[1;33m  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\033[0m"
    echo -e "\033[1;33m  ┃\033[0m  \033[1;37m🏛️ multi-agent-mansion\033[0m  〜 \033[1;36m貴族邸宅マルチエージェント統率システム\033[0m 〜      \033[1;33m┃\033[0m"
    echo -e "\033[1;33m  ┃\033[0m                                                                           \033[1;33m┃\033[0m"
    echo -e "\033[1;33m  ┃\033[0m    \033[1;35mButler\033[0m: 統括執事    \033[0;32mHead Maid\033[0m: 業務管理    \033[1;36mMaid\033[0m: 実働部隊×7     \033[1;33m┃\033[0m"
    echo -e "\033[1;33m  ┃\033[0m    \033[1;33mSecretary\033[0m: 秘書補佐   \033[0;33mInspector\033[0m: 品質監督官                         \033[1;33m┃\033[0m"
    echo -e "\033[1;33m  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\033[0m"
    echo ""
}

# バナー表示実行
show_service_start

echo -e "  \033[1;33m至高のサービスをお届けいたします\033[0m (Providing excellent service)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: 既存セッションクリーンアップ
# ═══════════════════════════════════════════════════════════════════════════════
log_info "🧹 既存のセッションを終了中..."
tmux kill-session -t servants 2>/dev/null && log_info "  └─ servants セッション、終了完了" || log_info "  └─ servants セッションは存在せず"
tmux kill-session -t lady 2>/dev/null && log_info "  └─ lady セッション、終了完了" || log_info "  └─ lady セッションは存在せず"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1.5: 前回記録のバックアップ（内容がある場合のみ）
# ═══════════════════════════════════════════════════════════════════════════════
BACKUP_DIR="./logs/backup_$(date '+%Y%m%d_%H%M%S')"
NEED_BACKUP=false

if [ -f "./dashboard.md" ]; then
    if grep -q "cmd_" "./dashboard.md" 2>/dev/null; then
        NEED_BACKUP=true
    fi
fi

if [ "$NEED_BACKUP" = true ]; then
    mkdir -p "$BACKUP_DIR" || true
    cp "./dashboard.md" "$BACKUP_DIR/" 2>/dev/null || true
    cp -r "./queue/reports" "$BACKUP_DIR/" 2>/dev/null || true
    cp -r "./queue/tasks" "$BACKUP_DIR/" 2>/dev/null || true
    cp "./queue/butler_to_head_maid.yaml" "$BACKUP_DIR/" 2>/dev/null || true
    log_info "📦 前回の記録をバックアップ: $BACKUP_DIR"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: 報告ファイルリセット
# ═══════════════════════════════════════════════════════════════════════════════
log_info "📜 前回の記録を整理中..."

# queue ディレクトリが存在しない場合は作成
[ -d ./queue/reports ] || mkdir -p ./queue/reports
[ -d ./queue/tasks ] || mkdir -p ./queue/tasks

# Maid1-7, Inspector タスクファイルリセット
for i in {1..7}; do
    cat > ./queue/tasks/maid${i}.yaml << EOF
# メイド${i}専用タスクファイル
task:
  task_id: null
  parent_cmd: null
  description: null
  target_path: null
  status: idle
  timestamp: ""
EOF
done

cat > ./queue/tasks/inspector.yaml << 'EOF'
# Inspector専用タスクファイル
task:
  task_id: null
  parent_cmd: null
  description: null
  target_path: null
  status: idle
  timestamp: ""
EOF

# Maid1-7, Inspector レポートファイルリセット
for i in {1..7}; do
    cat > ./queue/reports/maid${i}_report.yaml << EOF
worker_id: maid${i}
task_id: null
timestamp: ""
status: idle
result: null
EOF
done

cat > ./queue/reports/inspector_report.yaml << 'EOF'
worker_id: inspector
task_id: null
timestamp: ""
status: idle
result: null
EOF

# キューファイルリセット
cat > ./queue/butler_to_head_maid.yaml << 'EOF'
queue: []
EOF

cat > ./queue/head_maid_to_servants.yaml << 'EOF'
assignments:
  maid1:
    task_id: null
    description: null
    target_path: null
    status: idle
  maid2:
    task_id: null
    description: null
    target_path: null
    status: idle
  maid3:
    task_id: null
    description: null
    target_path: null
    status: idle
  maid4:
    task_id: null
    description: null
    target_path: null
    status: idle
  maid5:
    task_id: null
    description: null
    target_path: null
    status: idle
  maid6:
    task_id: null
    description: null
    target_path: null
    status: idle
  maid7:
    task_id: null
    description: null
    target_path: null
    status: idle
  inspector:
    task_id: null
    description: null
    target_path: null
    status: idle
EOF

log_success "✅ 整理完了"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: ダッシュボード初期化
# ═══════════════════════════════════════════════════════════════════════════════
log_info "📊 業務報告書を初期化中..."
TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

if [ "$LANG_SETTING" = "ja" ]; then
    # 日本語のみ
    cat > ./dashboard.md << EOF
# 📊 業務報告
最終更新: ${TIMESTAMP}

## 🚨 要対応 - お嬢様のご判断をお待ちしております
なし

## 🔄 進行中 - 只今、業務遂行中でございます
なし

## ✅ 本日の業務成果
| 時刻 | 業務場所 | 業務内容 | 結果 |
|------|----------|----------|------|

## 🎯 スキル化候補 - 承認待ち
なし

## 🛠️ 生成されたスキル
なし

## ⏸️ 待機中
なし

## ❓ お伺い事項
なし
EOF
else
    # 日本語 + 翻訳併記
    cat > ./dashboard.md << EOF
# 📊 業務報告 (Service Report)
最終更新 (Last Updated): ${TIMESTAMP}

## 🚨 要対応 - お嬢様のご判断をお待ちしております (Action Required - Awaiting Lady's Decision)
なし (None)

## 🔄 進行中 - 只今、業務遂行中でございます (In Progress - Currently Working)
なし (None)

## ✅ 本日の業務成果 (Today's Achievements)
| 時刻 (Time) | 業務場所 (Location) | 業務内容 (Task) | 結果 (Result) |
|------|----------|----------|------|

## 🎯 スキル化候補 - 承認待ち (Skill Candidates - Pending Approval)
なし (None)

## 🛠️ 生成されたスキル (Generated Skills)
なし (None)

## ⏸️ 待機中 (On Standby)
なし (None)

## ❓ お伺い事項 (Questions for Lady)
なし (None)
EOF
fi

log_success "  └─ ダッシュボード初期化完了 (言語: $LANG_SETTING, シェル: $SHELL_SETTING)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: tmux の存在確認
# ═══════════════════════════════════════════════════════════════════════════════
if ! command -v tmux &> /dev/null; then
    echo ""
    echo "  ╔════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] tmux not found!                              ║"
    echo "  ║  tmux が見つかりません                                 ║"
    echo "  ╠════════════════════════════════════════════════════════╣"
    echo "  ║  Run first_setup.sh first:                            ║"
    echo "  ║  まず first_setup.sh を実行してください:               ║"
    echo "  ║     ./first_setup.sh                                  ║"
    echo "  ╚════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: lady セッション作成（1ペイン・window 0 を必ず確保）
# ═══════════════════════════════════════════════════════════════════════════════
log_service "👔 執事長の執務室を構築中..."

# lady セッションがなければ作る（-s 時もここで必ず lady が存在するようにする）
# window 0 のみ作成し -n main で名前付け（第二 window にするとアタッチ時に空ペインが開くため 1 window に限定）
if ! tmux has-session -t lady 2>/dev/null; then
    tmux new-session -d -s lady -n main
fi

# 執事長ペインはウィンドウ名 "main" で指定（base-index 1 環境でも動く）
BUTLER_PROMPT=$(generate_prompt "Butler" "dark_magenta" "$SHELL_SETTING")
tmux select-pane -t lady:main -T "Butler"
tmux set-option -p -t lady:main @agent_id "butler"
# API Provider に応じてモデル選択（anthropic: Opus, bedrock: Sonnet）
if [ "$API_PROVIDER" = "bedrock" ]; then
    BUTLER_MODEL="Sonnet"
else
    BUTLER_MODEL="Opus"
fi
tmux set-option -p -t lady:main @model_name "$BUTLER_MODEL"
tmux send-keys -t lady:main "cd \"$(pwd)\" && export PS1='${BUTLER_PROMPT}' && clear" Enter
tmux select-pane -t lady:main -P 'bg=#002b36'  # 執事長の Solarized Dark

# pane-border-format でモデル名を常時表示
tmux set-option -t lady -w pane-border-status top
tmux set-option -t lady -w pane-border-format '#{pane_index} #{@agent_id} (#{?#{==:#{@model_name},},unknown,#{@model_name}})'

log_success "  └─ 執事長の執務室、構築完了"
echo ""

# pane-base-index を取得（1 の環境ではペインは 1,2,... になる）
PANE_BASE=$(tmux show-options -gv pane-base-index 2>/dev/null || echo 0)

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5.1: servants セッション作成（9ペイン：Head Maid + Secretary + Maid1-6 + Inspector）
# ═══════════════════════════════════════════════════════════════════════════════
log_service "💼 使用人の控室を構築中（9名配備）..."

# 最初のペイン作成
if ! tmux new-session -d -s servants -n "staff" 2>/dev/null; then
    echo ""
    echo "  ╔════════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] Failed to create tmux session 'servants'        ║"
    echo "  ║  tmux セッション 'servants' の作成に失敗しました         ║"
    echo "  ╠════════════════════════════════════════════════════════════╣"
    echo "  ║  An existing session may be running.                     ║"
    echo "  ║  既存セッションが残っている可能性があります              ║"
    echo "  ║                                                          ║"
    echo "  ║  Check: tmux ls                                          ║"
    echo "  ║  Kill:  tmux kill-session -t servants                    ║"
    echo "  ╚════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# 3x3グリッド作成（合計9ペイン）
# ペイン番号は pane-base-index に依存（0 または 1）
# 最初に3列に分割
tmux split-window -h -t "servants:staff"
tmux split-window -h -t "servants:staff"

# 各列を3行に分割
tmux select-pane -t "servants:staff.${PANE_BASE}"
tmux split-window -v
tmux split-window -v

tmux select-pane -t "servants:staff.$((PANE_BASE+3))"
tmux split-window -v
tmux split-window -v

tmux select-pane -t "servants:staff.$((PANE_BASE+6))"
tmux split-window -v
tmux split-window -v

# ペインタイトル設定（0: Head Maid, 1: Secretary, 2-7: Maid1-6, 8: Inspector）
PANE_TITLES=("Head Maid" "Secretary" "Maid1" "Maid2" "Maid3" "Maid4" "Maid5" "Maid6" "Inspector")
# 色設定（Head Maid: 濃緑, Secretary: 黄色, Maid: 水色, Inspector: オレンジ）
PANE_COLORS=("dark_green" "yellow" "cyan" "cyan" "cyan" "cyan" "cyan" "cyan" "orange")
# エージェントID設定（tmux変数として保存）
AGENT_IDS=("head_maid" "secretary" "maid1" "maid2" "maid3" "maid4" "maid5" "maid6" "inspector")
# モデル名設定（API Provider に応じて切り替え）
# bedrock: Head Maid/Maid/Inspector=Sonnet, Secretary=Haiku
# anthropic: shogun方式（Head Maid: Opus, Secretary: Haiku, Maid: Sonnet, Inspector: Opus）
if [ "$API_PROVIDER" = "bedrock" ]; then
    MODEL_NAMES=("Sonnet" "Haiku" "Sonnet" "Sonnet" "Sonnet" "Sonnet" "Sonnet" "Sonnet" "Sonnet")
else
    MODEL_NAMES=("Opus" "Haiku" "Sonnet" "Sonnet" "Sonnet" "Sonnet" "Sonnet" "Sonnet" "Opus")
fi

for i in {0..8}; do
    p=$((PANE_BASE + i))
    pane_title="${PANE_TITLES[$i]}"
    tmux select-pane -t "servants:staff.${p}" -T "${pane_title}"
    tmux set-option -p -t "servants:staff.${p}" @agent_id "${AGENT_IDS[$i]}"
    tmux set-option -p -t "servants:staff.${p}" @model_name "${MODEL_NAMES[$i]}"
    PROMPT_STR=$(generate_prompt "${pane_title}" "${PANE_COLORS[$i]}" "$SHELL_SETTING")
    tmux send-keys -t "servants:staff.${p}" "cd \"$(pwd)\" && export PS1='${PROMPT_STR}' && clear" Enter
done

# pane-border-format でモデル名を常時表示（Claude Codeがペインタイトルを上書きしても消えない）
tmux set-option -t servants -w pane-border-status top
tmux set-option -t servants -w pane-border-format '#{pane_index} #{@agent_id} (#{?#{==:#{@model_name},},unknown,#{@model_name}})'

log_success "  └─ 使用人の控室、構築完了"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: Claude Code 起動（-s / --setup-only のときはスキップ）
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$SETUP_ONLY" = false ]; then
    # AI Provider に応じて起動コマンドを決定
    if [ "$AI_PROVIDER" = "codex" ]; then
        # Codex の場合（仮のコマンド例）
        CLAUDE_CMD="codex"
        log_info "  └─ AI Provider: Codex"
    else
        # Claude の場合（デフォルト）
        CLAUDE_CMD="claude"
        log_info "  └─ AI Provider: Claude"
    fi

    # CLI の存在チェック
    if ! command -v "$CLAUDE_CMD" &> /dev/null; then
        log_info "⚠️  $CLAUDE_CMD コマンドが見つかりません"
        echo "  first_setup.sh を再実行してください:"
        echo "    ./first_setup.sh"
        exit 1
    fi

    log_service "👔 全員に $CLAUDE_CMD を召喚中..."
    log_info "  └─ API Provider: $API_PROVIDER"

    # API Provider に応じてモデルを決定
    if [ "$API_PROVIDER" = "bedrock" ]; then
        # bedrock: 環境変数から完全なモデルIDを使用
        BUTLER_CLI_MODEL="$MODEL_SONNET"
        HEAD_MAID_CLI_MODEL="$MODEL_SONNET"
        SECRETARY_CLI_MODEL="$MODEL_HAIKU"
        MAID_CLI_MODEL="$MODEL_SONNET"
        INSPECTOR_CLI_MODEL="$MODEL_SONNET"
    elif [ "$API_PROVIDER" = "codex" ]; then
        # codex: 提案されたモデル割り当て
        # 認証: 環境変数 OPENAI_CODEX_API_KEY
        # エンドポイント: Claude Codeと同じ（Anthropic標準）
        BUTLER_CLI_MODEL="gpt-5.2-pro"
        HEAD_MAID_CLI_MODEL="gpt-5.2-pro"
        SECRETARY_CLI_MODEL="gpt-5.1-codex-mini"
        MAID_CLI_MODEL="gpt-5.2-codex"
        INSPECTOR_CLI_MODEL="gpt-5.2-pro"
    else
        # anthropic: shogun方式（エイリアス使用）
        BUTLER_CLI_MODEL="opus"
        HEAD_MAID_CLI_MODEL="opus"
        SECRETARY_CLI_MODEL="haiku"
        MAID_CLI_MODEL="sonnet"
        INSPECTOR_CLI_MODEL="opus"
    fi

    # 執事長
    tmux send-keys -t lady:main "$CLAUDE_CMD --model $BUTLER_CLI_MODEL --dangerously-skip-permissions"
    tmux send-keys -t lady:main Enter
    log_info "  └─ 執事長（${BUTLER_CLI_MODEL}）、召喚完了"

    # 少し待機（安定のため）
    sleep 1

    # Head Maid
    p=$((PANE_BASE + 0))
    tmux send-keys -t "servants:staff.${p}" "$CLAUDE_CMD --model $HEAD_MAID_CLI_MODEL --dangerously-skip-permissions"
    tmux send-keys -t "servants:staff.${p}" Enter
    log_info "  └─ メイド長（${HEAD_MAID_CLI_MODEL}）、召喚完了"

    # Secretary
    p=$((PANE_BASE + 1))
    tmux send-keys -t "servants:staff.${p}" "$CLAUDE_CMD --model $SECRETARY_CLI_MODEL --dangerously-skip-permissions"
    tmux send-keys -t "servants:staff.${p}" Enter
    log_info "  └─ 秘書（${SECRETARY_CLI_MODEL}）、召喚完了"

    # Maid1-6
    for i in {2..7}; do
        p=$((PANE_BASE + i))
        tmux send-keys -t "servants:staff.${p}" "$CLAUDE_CMD --model $MAID_CLI_MODEL --dangerously-skip-permissions"
        tmux send-keys -t "servants:staff.${p}" Enter
    done
    log_info "  └─ メイド1-6（${MAID_CLI_MODEL}）、召喚完了"

    # Inspector
    p=$((PANE_BASE + 8))
    tmux send-keys -t "servants:staff.${p}" "$CLAUDE_CMD --model $INSPECTOR_CLI_MODEL --dangerously-skip-permissions"
    tmux send-keys -t "servants:staff.${p}" Enter
    log_info "  └─ 監督官（${INSPECTOR_CLI_MODEL}）、召喚完了"

    log_success "✅ 全員 Claude Code 起動完了"
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 6.5: 各エージェントに指示書を読み込ませる
    # ═══════════════════════════════════════════════════════════════════════════
    log_service "📜 各エージェントに指示書を読み込ませ中..."
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # 邸宅スタッフ図
    # ═══════════════════════════════════════════════════════════════════════════
    echo -e "\033[1;35m  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐\033[0m"
    echo -e "\033[1;35m  │\033[0m                              \033[1;37m【 貴 族 邸 宅 使 用 人 】\033[0m                                                   \033[1;35m│\033[0m"
    echo -e "\033[1;35m  └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘\033[0m"

    cat << 'MANSION_EOF'

                          🏛️
                     ╔════════════╗
                     ║   BUTLER   ║  執事長（統括）
                     ╚═════╤══════╝
                           │
              ╔════════════╪════════════╗
              ▼            ▼            ▼
         ┌─────────┐  ┌─────────┐  ┌─────────┐
         │Head Maid│  │Secretary│  │Inspector│
         │(メイド長)│  │ (秘書)  │  │(監督官) │
         └────┬────┘  └─────────┘  └─────────┘
              │
    ┌─────┬───┼───┬─────┬─────┬─────┐
    ▼     ▼   ▼   ▼     ▼     ▼     ▼
  [M1]  [M2] [M3] [M4]  [M5]  [M6]  [M7]

MANSION_EOF

    echo ""
    echo -e "                                    \033[1;35m「 至高のサービスをお届けいたします！ 」\033[0m"
    echo ""

    echo "  Claude Code の起動を待機中（最大30秒）..."

    # 執事長の起動を確認（最大30秒待機）
    for i in {1..30}; do
        if tmux capture-pane -t lady:main -p | grep -q "bypass permissions"; then
            echo "  └─ 執事長の Claude Code 起動確認完了（${i}秒）"
            break
        fi
        sleep 1
    done

    # 執事長に指示書を読み込ませる
    log_info "  └─ 執事長に指示書を伝達中..."
    tmux send-keys -t lady:main "instructions/butler.md を読んで役割を理解せよ"
    sleep 0.5
    tmux send-keys -t lady:main Enter

    # メイド長に指示書を読み込ませる
    sleep 2
    log_info "  └─ メイド長に指示書を伝達中..."
    tmux send-keys -t "servants:staff.${PANE_BASE}" "instructions/head_maid.md を読んで役割を理解せよ"
    sleep 0.5
    tmux send-keys -t "servants:staff.${PANE_BASE}" Enter

    # 秘書に指示書を読み込ませる
    sleep 2
    log_info "  └─ 秘書に指示書を伝達中..."
    tmux send-keys -t "servants:staff.$((PANE_BASE+1))" "instructions/secretary.md を読んで役割を理解せよ"
    sleep 0.5
    tmux send-keys -t "servants:staff.$((PANE_BASE+1))" Enter

    # メイドに指示書を読み込ませる（2-7 = Maid1-6）
    sleep 2
    log_info "  └─ メイドに指示書を伝達中..."
    for i in {1..6}; do
        p=$((PANE_BASE + 1 + i))
        tmux send-keys -t "servants:staff.${p}" "instructions/maid.md を読んで役割を理解してください。あなたはメイド${i}号です"
        sleep 0.3
        tmux send-keys -t "servants:staff.${p}" Enter
        sleep 0.5
    done

    # 監督官に指示書を読み込ませる
    sleep 2
    log_info "  └─ 監督官に指示書を伝達中..."
    tmux send-keys -t "servants:staff.$((PANE_BASE+8))" "instructions/inspector.md を読んで役割を理解せよ"
    sleep 0.5
    tmux send-keys -t "servants:staff.$((PANE_BASE+8))" Enter

    log_success "✅ 全員に指示書伝達完了"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7: 環境確認・完了メッセージ
# ═══════════════════════════════════════════════════════════════════════════════
log_info "🔍 配置を確認中..."
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  📺 Tmuxセッション (Sessions)                            │"
echo "  └──────────────────────────────────────────────────────────┘"
tmux list-sessions | sed 's/^/     /'
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  📋 配置図 (Formation)                                   │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "     【ladyセッション】執事長の執務室"
echo "     ┌─────────────────────────────┐"
echo "     │  Pane 0: Butler (執事長)    │  ← 総統括・プロジェクト管理"
echo "     └─────────────────────────────┘"
echo ""
echo "     【servantsセッション】使用人の控室（3x3 = 9ペイン）"
echo "     ┌───────────┬───────────┬───────────┐"
echo "     │Head Maid  │  Maid3    │  Maid6    │"
echo "     │(メイド長) │(メイド3)  │(メイド6)  │"
echo "     ├───────────┼───────────┼───────────┤"
echo "     │ Secretary │  Maid4    │   Maid7   │"
echo "     │  (秘書)   │(メイド4)  │(メイド7)  │"
echo "     ├───────────┼───────────┼───────────┤"
echo "     │  Maid1    │  Maid5    │ Inspector │"
echo "     │(メイド1)  │(メイド5)  │ (監督官)  │"
echo "     └───────────┴───────────┴───────────┘"
echo ""
echo "  ※ Maid2 は将来の拡張用として予約"
echo ""

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  🏛️ 勤務準備完了！至高のサービスを！                     ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "$SETUP_ONLY" = true ]; then
    echo "  ⚠️  セットアップのみモード: Claude Codeは未起動です"
    echo ""
    echo "  手動でClaude Codeを起動するには:"
    echo "  ┌──────────────────────────────────────────────────────────┐"
    echo "  │  # 執事長を召喚                                          │"
    echo "  │  tmux send-keys -t lady:main \\                           │"
    echo "  │    'claude --dangerously-skip-permissions' Enter         │"
    echo "  │                                                          │"
    echo "  │  # 使用人を一斉召喚                                      │"
    echo "  │  for p in \$(seq $PANE_BASE $((PANE_BASE+8))); do        │"
    echo "  │      tmux send-keys -t servants:staff.\$p \\              │"
    echo "  │      'claude --dangerously-skip-permissions' Enter       │"
    echo "  │  done                                                    │"
    echo "  └──────────────────────────────────────────────────────────┘"
    echo ""
fi

echo "  次のステップ:"
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  執事長の執務室にアタッチして命令を開始:                  │"
echo "  │     tmux attach-session -t lady   (または: ml)           │"
echo "  │                                                          │"
echo "  │  使用人の控室を確認する:                                  │"
echo "  │     tmux attach-session -t servants   (または: ms)       │"
echo "  │                                                          │"
echo "  │  ※ 各エージェントは指示書を読み込み済み。                 │"
echo "  │    すぐに命令を開始できます。                             │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "  ════════════════════════════════════════════════════════════"
echo "   至高のサービスをお届けいたします！ (Excellence in service!)"
echo "  ════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 8: Windows Terminal でタブを開く（-t オプション時のみ）
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$OPEN_TERMINAL" = true ]; then
    log_info "📺 Windows Terminal でタブを展開中..."

    # Windows Terminal が利用可能か確認
    if command -v wt.exe &> /dev/null; then
        wt.exe -w 0 new-tab wsl.exe -e bash -c "tmux attach-session -t lady" \; new-tab wsl.exe -e bash -c "tmux attach-session -t servants"
        log_success "  └─ ターミナルタブ展開完了"
    else
        log_info "  └─ wt.exe が見つかりません。手動でアタッチしてください。"
    fi
    echo ""
fi
