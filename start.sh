#!/bin/bash
# ============================================================
# AI 武林大会 · 启动脚本
# 用法: ./start.sh [端口号]   默认 3000
# ============================================================

PORT=${1:-3000}
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$DIR/logs"
mkdir -p "$LOG_DIR"

# 日志文件（按日期）
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/server_$DATE.log"

echo "===== AI 武林大会 启动 =====" | tee "$LOG_FILE"
echo "时间: $(date)" | tee -a "$LOG_FILE"
echo "端口: $PORT" | tee -a "$LOG_FILE"
echo "目录: $DIR" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 1. 杀掉占用该端口的进程
PID=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$PID" ]; then
  echo "发现端口 $PORT 被占用 (PID: $PID)，正在终止..." | tee -a "$LOG_FILE"
  kill -9 $PID 2>/dev/null
  sleep 1
  echo "已终止旧进程" | tee -a "$LOG_FILE"
else
  echo "端口 $PORT 空闲" | tee -a "$LOG_FILE"
fi

# 2. 启动开发服务器，日志同时输出到终端和文件
echo "" | tee -a "$LOG_FILE"
echo "启动 npm run dev (port=$PORT) ..." | tee -a "$LOG_FILE"
echo "日志文件: $LOG_FILE" | tee -a "$LOG_FILE"
echo "按 Ctrl+C 停止" | tee -a "$LOG_FILE"
echo "------------------------------" | tee -a "$LOG_FILE"

cd "$DIR"
PORT=$PORT npx next dev -p $PORT 2>&1 | tee -a "$LOG_FILE"
