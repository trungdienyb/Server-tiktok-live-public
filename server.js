// server.js
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { TikTokConnectionWrapper, WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const cors = require('cors');

// Khởi tạo ứng dụng Express
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Cấu hình CORS để cho phép kết nối từ frontend
app.use(cors());

// Phân phối các file tĩnh từ thư mục "public"
app.use(express.static(path.join(__dirname, 'public')));

// Dữ liệu kết nối TikTok đang hoạt động
const activeConnections = new Map();

// Xử lý kết nối WebSocket
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Gửi trạng thái khởi tạo
    ws.send(JSON.stringify({ type: 'status', connected: false }));
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // Xử lý các lệnh từ client
            if (data.command === 'connect') {
                await handleConnect(data.username, ws);
            } else if (data.command === 'disconnect') {
                await handleDisconnect(ws);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });
    
    // Xử lý ngắt kết nối
    ws.on('close', () => {
        console.log('Client disconnected');
        handleDisconnect(ws);
    });
});

// Xử lý yêu cầu kết nối TikTok Live
async function handleConnect(username, ws) {
    // Ngắt kết nối cũ nếu có
    await handleDisconnect(ws);
    
    try {
        // Làm sạch username (bỏ @ nếu có)
        username = username.startsWith('@') ? username.substring(1) : username;
        
        console.log(`Connecting to @${username}`);
        
        // Tạo kết nối TikTok Live
        const tiktokConnection = new WebcastPushConnection(username);
        
        // Thiết lập các handler sự kiện
        setupTikTokEventHandlers(tiktokConnection, ws);
        
        // Kết nối đến TikTok Live
        await tiktokConnection.connect();
        
        // Lưu trữ kết nối
        ws.tiktokConnection = tiktokConnection;
        activeConnections.set(ws, tiktokConnection);
        
        // Thông báo kết nối thành công
        ws.send(JSON.stringify({ 
            type: 'status', 
            connected: true, 
            username: username,
            roomInfo: tiktokConnection.roomInfo
        }));
        
    } catch (error) {
        console.error('Failed to connect to TikTok:', error);
        ws.send(JSON.stringify({ 
            type: 'error', 
            message: `Không thể kết nối đến @${username}: ${error.message}`
        }));
    }
}

// Xử lý ngắt kết nối TikTok Live
async function handleDisconnect(ws) {
    // Kiểm tra xem có kết nối đang hoạt động không
    const connection = activeConnections.get(ws);
    if (connection) {
        try {
            // Ngắt kết nối TikTok
            await connection.disconnect();
            console.log('Disconnected from TikTok');
        } catch (error) {
            console.error('Error disconnecting from TikTok:', error);
        }
        
        // Xóa kết nối khỏi danh sách đang hoạt động
        activeConnections.delete(ws);
        delete ws.tiktokConnection;
        
        // Thông báo ngắt kết nối thành công
        ws.send(JSON.stringify({ type: 'status', connected: false }));
    }
}

// Thiết lập các handler sự kiện TikTok
function setupTikTokEventHandlers(tiktokConnection, ws) {
    // Bình luận
    tiktokConnection.on('comment', (data) => {
        ws.send(JSON.stringify({
            type: 'comment',
            username: data.uniqueId,
            displayName: data.nickname,
            comment: data.comment,
            profilePictureUrl: data.profilePictureUrl,
            timestamp: Date.now()
        }));
    });
    
    // Quà tặng
    tiktokConnection.on('gift', (data) => {
        // Chỉ gửi quà có giá trị thực (không phải là combo)
        if (data.giftType === 1 && !data.isGroupGift) {
            ws.send(JSON.stringify({
                type: 'gift',
                username: data.uniqueId,
                displayName: data.nickname,
                giftName: data.giftName,
                diamondCount: data.diamondCount,
                repeatCount: data.repeatCount,
                profilePictureUrl: data.profilePictureUrl,
                timestamp: Date.now()
            }));
        }
    });
    
    // Lượt thích
    tiktokConnection.on('like', (data) => {
        ws.send(JSON.stringify({
            type: 'like',
            username: data.uniqueId,
            displayName: data.nickname,
            likeCount: data.likeCount,
            totalLikeCount: data.totalLikeCount,
            profilePictureUrl: data.profilePictureUrl,
            timestamp: Date.now()
        }));
    });
    
    // Người xem tham gia
    tiktokConnection.on('member', (data) => {
        ws.send(JSON.stringify({
            type: 'join',
            username: data.uniqueId,
            displayName: data.nickname,
            profilePictureUrl: data.profilePictureUrl,
            followRole: data.followInfo?.followStatus,
            timestamp: Date.now()
        }));
    });
    
    // Thông tin phòng (số người xem,...)
    tiktokConnection.on('roomUser', (data) => {
        ws.send(JSON.stringify({
            type: 'roomStats',
            viewerCount: data.viewerCount,
            likeCount: data.likeCount,
            diamondCount: data.diamondCount,
            timestamp: Date.now()
        }));
    });
    
    // Phiên trực tiếp kết thúc
    tiktokConnection.on('streamEnd', (data) => {
        ws.send(JSON.stringify({
            type: 'streamEnd',
            reason: data.reason
        }));
    });
    
    // Lỗi kết nối
    tiktokConnection.on('error', (err) => {
        console.error('TikTok connection error:', err);
        ws.send(JSON.stringify({
            type: 'error',
            message: `Lỗi kết nối: ${err.message}`
        }));
    });
}

// Định tuyến API
app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', connections: activeConnections.size });
});

// Route chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});