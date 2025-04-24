// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const usernameInput = document.getElementById('username');
    const connectBtn = document.getElementById('connectBtn');
    const statusDiv = document.getElementById('status');
    const commentsDiv = document.getElementById('comments');
    const giftsDiv = document.getElementById('gifts');
    const otherDiv = document.getElementById('other');
    const speechToggle = document.getElementById('speechToggle');
    const clearEvents = document.getElementById('clearEvents');
    const speechStatus = document.getElementById('speechStatus');
    const statsPanel = document.getElementById('statsPanel');
    const viewerCount = document.getElementById('viewerCount');
    const likeCount = document.getElementById('likeCount');
    const diamondCount = document.getElementById('diamondCount');
    const speechVolume = document.getElementById('speechVolume');
    const speechRate = document.getElementById('speechRate');

    // App State
    let connected = false;
    let speechEnabled = false;
    let socket = null;
    const speechQueue = [];
    let speaking = false;

    // Init
    init();

    // Initialize Application
    function init() {
        // Event listeners
        connectBtn.addEventListener('click', toggleConnection);
        speechToggle.addEventListener('click', toggleSpeech);
        clearEvents.addEventListener('click', clearAllEvents);
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') toggleConnection();
        });
    }

    // Toggle WebSocket connection
    function toggleConnection() {
        if (connected) {
            disconnectWebSocket();
        } else {
            connectWebSocket();
        }
    }

    // Connect to WebSocket server
    function connectWebSocket() {
        const username = usernameInput.value.trim();
        if (!username) {
            showAlert('Vui lòng nhập username TikTok');
            return;
        }

        // Determine WebSocket URL based on location
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            // Create WebSocket connection
            socket = new WebSocket(wsUrl);

            // Setup event handlers
            socket.onopen = () => {
                console.log('WebSocket connected');
                // Send connect command
                socket.send(JSON.stringify({
                    command: 'connect',
                    username: username
                }));
            };

            socket.onmessage = (event) => {
                handleWebSocketMessage(event.data);
            };

            socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                updateStatus(false, 'Lỗi kết nối WebSocket');
            };

            socket.onclose = () => {
                console.log('WebSocket closed');
                if (connected) {
                    updateStatus(false, 'Mất kết nối với server');
                }
            };

        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            updateStatus(false, `Lỗi: ${error.message}`);
        }
    }

    // Disconnect from WebSocket
    function disconnectWebSocket() {
        if (socket) {
            // Send disconnect command
            socket.send(JSON.stringify({
                command: 'disconnect'
            }));
            
            // Close socket
            socket.close();
            socket = null;
        }
    }

    // Handle WebSocket messages
    function handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'status':
                    updateStatus(message.connected, message.connected ? 
                        `Đã kết nối đến @${message.username}` : 'Đã ngắt kết nối');
                    if (message.connected) {
                        statsPanel.style.display = 'flex';
                    } else {
                        statsPanel.style.display = 'none';
                    }
                    break;
                    
                case 'comment':
                    addComment(message);
                    break;
                    
                case 'gift':
                    addGift(message);
                    break;
                    
                case 'like':
                    addLike(message);
                    break;
                    
                case 'join':
                    addJoin(message);
                    break;
                    
                case 'roomStats':
                    updateRoomStats(message);
                    break;
                    
                case 'streamEnd':
                    updateStatus(false, `Phiên trực tiếp đã kết thúc: ${message.reason}`);
                    break;
                    
                case 'error':
                    showAlert(message.message);
                    break;
                    
                default:
                    console.log('Unknown message type:', message);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }

    // Update connection status
    function updateStatus(isConnected, message) {
        connected = isConnected;
        statusDiv.textContent = message;
        statusDiv.className = `status ${isConnected ? 'connected' : 'disconnected'}`;
        connectBtn.textContent = isConnected ? 'Ngắt Kết Nối' : 'Kết Nối';
    }

    // Update room statistics
    function updateRoomStats(data) {
        viewerCount.textContent = formatNumber(data.viewerCount);
        likeCount.textContent = formatNumber(data.likeCount);
        diamondCount.textContent = formatNumber(data.diamondCount);
    }

    // Format large numbers
    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    // Add a comment to the UI
    function addComment(data) {
        const element = createEventElement('comment');
        
        // Create profile picture if available
        if (data.profilePictureUrl) {
            const img = document.createElement('img');
            img.src = data.profilePictureUrl;
            img.alt = data.username;
            img.className = 'profile-pic';
            element.appendChild(img);
        }
        
        // User info div
        const userInfo = document.createElement('div');
        userInfo.innerHTML = `
            <span class="username">${escapeHTML(data.username)}</span>
            <span class="nickname">${escapeHTML(data.displayName)}</span>
        `;
        element.appendChild(userInfo);
        
        // Comment content
        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = data.comment;
        element.appendChild(content);
        
        // Timestamp
        addTimestamp(element, data.timestamp);
        
        // Add to comments container
        commentsDiv.prepend(element);
        
        // Limit elements
        limitElements(commentsDiv, 50);
        
        // Read username and comment if speech is enabled
        if (speechEnabled) {
            addToSpeechQueue(`${data.displayName} nói: ${data.comment}`);
        }
    }

    // Add a gift event to the UI
    function addGift(data) {
        const element = createEventElement('gift');
        
        // Create profile picture if available
        if (data.profilePictureUrl) {
            const img = document.createElement('img');
            img.src = data.profilePictureUrl;
            img.alt = data.username;
            img.className = 'profile-pic';
            element.appendChild(img);
        }
        
        // User info div
        const userInfo = document.createElement('div');
        userInfo.innerHTML = `
            <span class="username">${escapeHTML(data.username)}</span>
            <span class="nickname">${escapeHTML(data.displayName)}</span>
        `;
        element.appendChild(userInfo);
        
        // Gift content
        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = `đã tặng ${data.repeatCount} ${data.giftName} (${data.diamondCount * data.repeatCount} diamonds)`;
        element.appendChild(content);
        
        // Timestamp
        addTimestamp(element, data.timestamp);
        
        // Add to gifts container
        giftsDiv.prepend(element);
        
        // Limit elements
        limitElements(giftsDiv, 50);
        
        // Read username and gift if speech is enabled
        if (speechEnabled) {
            addToSpeechQueue(`${data.displayName} tặng ${data.repeatCount} ${data.giftName}`);
        }
    }

    // Add a like event to the UI
    function addLike(data) {
        const element = createEventElement('like');
        
        // Create profile picture if available
        if (data.profilePictureUrl) {
            const img = document.createElement('img');
            img.src = data.profilePictureUrl;
            img.alt = data.username;
            img.className = 'profile-pic';
            element.appendChild(img);
        }
        
        // User info div
        const userInfo = document.createElement('div');
        userInfo.innerHTML = `
            <span class="username">${escapeHTML(data.username)}</span>
            <span class="nickname">${escapeHTML(data.displayName)}</span>
        `;
        element.appendChild(userInfo);
        
        // Like content
        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = `đã thả ${data.likeCount} tim ❤️`;
        element.appendChild(content);
        
        // Timestamp
        addTimestamp(element, data.timestamp);
        
        // Add to other container
        otherDiv.prepend(element);
        
        // Limit elements
        limitElements(otherDiv, 50);
    }

    // Add a join event to the UI
    function addJoin(data) {
        const element = createEventElement('join');
        
        // Create profile picture if available
        if (data.profilePictureUrl) {
            const img = document.createElement('img');
            img.src = data.profilePictureUrl;
            img.alt = data.username;
            img.className = 'profile-pic';
            element.appendChild(img);
        }
        
        // User info div
        const userInfo = document.createElement('div');
        userInfo.innerHTML = `
            <span class="username">${escapeHTML(data.username)}</span>
            <span class="nickname">${escapeHTML(data.displayName)}</span>
        `;
        element.appendChild(userInfo);
        
        // Join content
        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = 'đã tham gia phiên trực tiếp';
        element.appendChild(content);
        
        // Timestamp
        addTimestamp(element, data.timestamp);
        
        // Add to other container
        otherDiv.prepend(element);
        
        // Limit elements
        limitElements(otherDiv, 50);
        
        // Read username if speech is enabled
        if (speechEnabled) {
            addToSpeechQueue(`${data.displayName} đã tham gia`);
        }
    }

    // Create a base event element
    function createEventElement(type) {
        const element = document.createElement('div');
        element.className = `event ${type}`;
        return element;
    }

    // Add timestamp to event element
    function addTimestamp(element, timestamp) {
        const time = document.createElement('div');
        time.className = 'timestamp';
        time.textContent = formatTime(timestamp);
        element.appendChild(time);
    }

    // Format timestamp
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    // Limit number of elements in a container
    function limitElements(container, maxCount) {
        while (container.children.length > maxCount) {
            container.removeChild(container.lastChild);
        }
    }

    // Clear all events
    function clearAllEvents() {
        commentsDiv.innerHTML = '';
        giftsDiv.innerHTML = '';
        otherDiv.innerHTML = '';
    }

    // Toggle speech functionality
    function toggleSpeech() {
        speechEnabled = !speechEnabled;
        if (speechEnabled) {
            speechToggle.textContent = 'Tắt Đọc Tên';
            speechToggle.classList.remove('disabled');
            speechStatus.textContent = 'Đọc tên: Bật';
            
            // Test speech synthesis if available
            if ('speechSynthesis' in window) {
                const test = new SpeechSynthesisUtterance('Đọc tên đã được bật');
                test.lang = 'vi-VN';
                window.speechSynthesis.speak(test);
            } else {
                showAlert('Trình duyệt của bạn không hỗ trợ Speech Synthesis');
                speechEnabled = false;
                speechToggle.textContent = 'Bật Đọc Tên (Không hỗ trợ)';
                speechToggle.classList.add('disabled');
            }
        } else {
            speechToggle.textContent = 'Bật Đọc Tên';
            speechToggle.classList.add('disabled');
            speechStatus.textContent = 'Đọc tên: Tắt';
            
            // Cancel current speech and clear queue
            window.speechSynthesis.cancel();
            speechQueue.length = 0;
        }
    }

    // Add text to speech queue
    function addToSpeechQueue(text) {
        speechQueue.push(text);
        if (!speaking) {
            processSpeechQueue();
        }
    }

    // Process speech queue
    function processSpeechQueue() {
        if (speechQueue.length === 0 || !speechEnabled) {
            speaking = false;
            return;
        }
        
        speaking = true;
        const text = speechQueue.shift();
        
        // Create utterance
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.volume = parseFloat(speechVolume.value);
        utterance.rate = parseFloat(speechRate.value);
        
        utterance.onend = function() {
            setTimeout(processSpeechQueue, 300);
        };
        
        // Handle error
        utterance.onerror = function(event) {
            console.error('Speech synthesis error:', event);
            setTimeout(processSpeechQueue, 300);
        };
        
        // Speak
        window.speechSynthesis.speak(utterance);
    }

    // Show alert
    function showAlert(message) {
        alert(message);
    }

    // Escape HTML to prevent XSS
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});