#!/bin/bash
# Ani-Mime — install zsh hooks into ~/.zshrc

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TARGET_FILE="$SCRIPT_DIR/terminal-mirror.zsh"
ZSHRC="$HOME/.zshrc"

if [ ! -f "$TARGET_FILE" ]; then
  echo "Error: terminal-mirror.zsh not found at $TARGET_FILE"
  exit 1
fi

if ! grep -q "terminal-mirror.zsh" "$ZSHRC" 2>/dev/null; then
  echo "" >> "$ZSHRC"
  echo "# --- Ani-Mime Terminal Hook ---" >> "$ZSHRC"
  echo "source \"$TARGET_FILE\"" >> "$ZSHRC"
  echo "Ani-Mime: zsh hook installed. Run 'source ~/.zshrc' or open a new terminal."
else
  echo "Ani-Mime: zsh hook already installed."
fi
