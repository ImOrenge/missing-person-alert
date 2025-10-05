const WebSocket = require('ws');

class WebSocketManager {
  constructor(port) {
    this.wss = new WebSocket.Server({ port });
    this.clients = new Set();
    this.onNewConnection = null; // 새 연결 시 콜백
    this.setupServer();
  }

  setupServer() {
    this.wss.on('connection', (ws) => {
      console.log('✅ 새 클라이언트 연결됨');
      this.clients.add(ws);

      // 핑퐁 하트비트 처리
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch (error) {
          console.error('메시지 파싱 오류:', error.message);
        }
      });

      ws.on('close', () => {
        console.log('❌ 클라이언트 연결 종료');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket 오류:', error.message);
        this.clients.delete(ws);
      });

      // 연결 성공 메시지 전송
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: '실시간 알림 서버에 연결되었습니다',
        timestamp: new Date().toISOString()
      }));

      // 새 연결 콜백 실행 (초기 데이터 전송용)
      if (this.onNewConnection && typeof this.onNewConnection === 'function') {
        this.onNewConnection(ws);
      }
    });
  }

  // 모든 클라이언트에게 브로드캐스트
  broadcast(type, data) {
    const message = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString()
    });

    let successCount = 0;
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
          successCount++;
        } catch (error) {
          console.error('메시지 전송 실패:', error.message);
        }
      }
    });

    console.log(`📡 ${successCount}명의 클라이언트에게 ${type} 전송됨`);
    return successCount;
  }

  // 연결된 클라이언트 수 반환
  getClientCount() {
    return this.clients.size;
  }

  // 특정 클라이언트에게만 메시지 전송
  sendToClient(client, type, data) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        const message = JSON.stringify({
          type,
          data,
          timestamp: new Date().toISOString()
        });
        client.send(message);
        console.log(`📤 클라이언트에게 ${type} 전송됨`);
        return true;
      } catch (error) {
        console.error('메시지 전송 실패:', error.message);
        return false;
      }
    }
    return false;
  }

  // 새 연결 콜백 설정
  setOnNewConnection(callback) {
    this.onNewConnection = callback;
  }
}

module.exports = WebSocketManager;
