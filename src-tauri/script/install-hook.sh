#!/bin/bash

# Lấy đường dẫn tuyệt đối của thư mục chứa script này
# Sau đó đi ngược lên 1 cấp để tìm file terminal-mirror.zsh (nếu nó nằm cùng folder)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TARGET_FILE="$SCRIPT_DIR/terminal-mirror.zsh"
ZSHRC="$HOME/.zshrc"

# Kiểm tra xem file .zsh tồn tại không trước khi add
if [ ! -f "$TARGET_FILE" ]; then
  echo "❌ Lỗi: Không tìm thấy file $TARGET_FILE"
  exit 1
fi

# Thêm vào .zshrc nếu chưa có
if ! grep -q "terminal-mirror.zsh" "$ZSHRC"; then
  echo "" >> "$ZSHRC"
  echo "# --- Terminal Mirror Hook ---" >> "$ZSHRC"
  echo "source $TARGET_FILE" >> "$ZSHRC"
  echo "✅ Đã gắn hook vào .zshrc thành công!"
else
  echo "ℹ️ Hook đã tồn tại trong .zshrc rồi fen."
fi