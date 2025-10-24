// ========== CONFIGURACIÓN ==========
const firebaseConfig = {
    apiKey: "AIzaSyCZz9O5ti5gylczX58X4Ni-WxsliV3m54Y",
    authDomain: "hereaca.firebaseapp.com",
    projectId: "hereaca",
    storageBucket: "hereaca.firebasestorage.app",
    messagingSenderId: "554391595579",
    appId: "1:554391595579:android:aa94be82ce48a0b39f0a1e"
};

// ========== INICIALIZACIÓN ==========
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
mapboxgl.accessToken = 'pk.eyJ1IjoiY2VjaWxpYXRhcmlmYTAwIiwiYSI6ImNtZnU2NHp2ZTExdTYyanBvNHVrc2hwcTMifQ.tZj5j0FWDcRHNkzYU-t0SQ';

let map;
let marker = null;
let isFirstLoad = true;
let currentMode = 'live';
let routeCoordinates = [];
let geofences = [];
let locationHistory = [];
let isNightMode = false;
let isFullscreen = false;
let isSidebarOpen = false;
let locationBuffer = [];
const LOCATION_BUFFER_SIZE = 5;
let shareUrl = '';
let currentUserId = '';

// Variables para el dibujo de geocercas
let isDrawingGeofence = false;
let currentGeofencePoints = [];
let geofenceMarkers = [];
let geofenceLines = [];

// Variables para el sistema de rutas
let isRecordingRoute = false;
let recordedRoutes = [];
let currentRoute = {
    id: null,
    name: '',
    points: [],
    startTime: null,
    endTime: null,
    distance: 0
};

// ========== FUNCIONES DE NOTIFICACIÓN ==========
function showNotification(title, message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let icon = 'info-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'success') icon = 'check-circle';

    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fas fa-${icon}"></i>
        </div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(notification);

    // Auto-remover después de 5 segundos
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);

    // Cerrar manualmente
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    });
}

// ========== FUNCIONES DE DEBUG ==========
function addDebugLog(message, type = 'info') {
    const logsDiv = document.getElementById('debug-logs');
    const logEntry = document.createElement('div');
    logEntry.className = 'debug-entry';

    const time = new Date().toLocaleTimeString();
    logEntry.innerHTML = `<span class="debug-time">[${time}]</span> ${message}`;

    if (type === 'error') {
        logEntry.style.color = 'var(--error-color)';
    } else if (type === 'success') {
        logEntry.style.color = 'var(--success-color)';
    } else if (type === 'warning') {
        logEntry.style.color = 'var(--warning-color)';
    }

    logsDiv.appendChild(logEntry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
    console.log(`[${type.toUpperCase()}] ${message}`);
}

function updateStatus(status, isOnline = true) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    if (isOnline) {
        statusDot.className = 'status-dot';
        statusText.textContent = status;
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = status;
    }
}

// ========== MANEJO DEL SIDEBAR ==========
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const map = document.getElementById('map');

    isSidebarOpen = !isSidebarOpen;
    sidebar.classList.toggle('active', isSidebarOpen);

    if (isSidebarOpen) {
        map.style.marginLeft = 'var(--sidebar-width)';
    } else {
        map.style.marginLeft = '0';
    }
}

// ========== FUNCIONES PARA COMPARTIR ==========
function generateShareUrl() {
    // Crear un ID único para este dispositivo
    if (!currentUserId) {
        // Generar un ID único o usar uno existente
        currentUserId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('trackerUserId', currentUserId);
    }

    // Crear URL con parámetro de usuario
    const baseUrl = window.location.href.split('?')[0];
    shareUrl = `${baseUrl}?track=${currentUserId}`;

    // Actualizar el campo de URL en el modal
    const shareUrlInput = document.getElementById('share-url');
    if (shareUrlInput) {
        shareUrlInput.value = shareUrl;
    }

    return shareUrl;
}

function showShareModal() {
    generateShareUrl();
    const modal = document.getElementById('share-modal');
    modal.style.display = 'flex';

    // Ocultar contenedores adicionales
    document.getElementById('link-container').style.display = 'none';
    document.getElementById('qr-container').style.display = 'none';
}

function hideShareModal() {
    const modal = document.getElementById('share-modal');
    modal.style.display = 'none';
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Enlace copiado', 'El enlace se ha copiado al portapapeles', 'success');
    }).catch(err => {
        console.error('Error al copiar: ', err);
        // Fallback para navegadores antiguos
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Enlace copiado', 'El enlace se ha copiado al portapapeles', 'success');
    });
}

function shareOnWhatsApp() {
    const message = `¡Hola! Puedes ver mi ubicación en tiempo real aquí: ${shareUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

function shareOnTelegram() {
    const message = `¡Hola! Puedes ver mi ubicación en tiempo real aquí: ${shareUrl}`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

function generateQRCode() {
    const canvas = document.getElementById('qr-code');
    const container = document.getElementById('qr-container');

    // Mostrar contenedor QR
    document.getElementById('link-container').style.display = 'none';
    container.style.display = 'block';

    // Limpiar canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Generar QR code
    QRCode.toCanvas(canvas, shareUrl, {
        width: 200,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    }, function(error) {
        if (error) {
            console.error('Error generando QR:', error);
            // Fallback simple si hay error
            ctx.fillStyle = '#000';
            ctx.fillRect(50, 50, 100, 100);
            ctx.fillStyle = '#fff';
            ctx.fillRect(70, 70, 60, 60);
            ctx.fillStyle = '#000';
            ctx.fillRect(90, 90, 20, 20);

            ctx.fillStyle = '#000';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Escanea para ver mi ubicación', 100, 180);
        }
    });
}

// ========== FIRESTORE LISTENER ==========
function initializeFirestoreListener() {
    updateStatus('Conectando...', false);
    addDebugLog('Iniciando listener de Firestore...', 'info');

    db.collection("ubicaciones")
        .onSnapshot({
            next: (snapshot) => {
                addDebugLog(`Datos recibidos: ${snapshot.size} documentos`, 'success');
                updateStatus('Conectado', true);

                let changesDetected = false;

                snapshot.docChanges().forEach((change) => {
                    const docId = change.doc.id;
                    const data = change.doc.data();

                    addDebugLog(`Cambio: ${change.type} - Documento: ${docId}`, 'success');

                    if (data.latitud !== undefined && data.longitud !== undefined) {
                        addDebugLog(`Coordenadas válidas: ${data.latitud}, ${data.longitud}`, 'success');

                        // Guardar ID de usuario para compartir
                        if (data.idUsuario && !currentUserId) {
                            currentUserId = data.idUsuario;
                            generateShareUrl();
                        }

                        processLocationUpdate(data.latitud, data.longitud, data);
                        changesDetected = true;
                    } else {
                        addDebugLog('Datos incompletos en documento', 'warning');
                    }
                });

                if (!changesDetected && snapshot.size > 0) {
                    const latestDoc = snapshot.docs[snapshot.docs.length - 1];
                    const data = latestDoc.data();
                    if (data.latitud && data.longitud) {
                        addDebugLog('Procesando última ubicación disponible', 'info');
                        processLocationUpdate(data.latitud, data.longitud, data);
                    }
                }
            },
            error: (error) => {
                addDebugLog(`Error Firestore: ${error.message}`, 'error');
                updateStatus('Error de conexión', false);
                setTimeout(initializeFirestoreListener, 5000);
            }
        });
}

// ========== PROCESAMIENTO DE UBICACIÓN ==========
function processLocationUpdate(lat, lng, data) {
    addDebugLog(`Procesando ubicación: ${lat}, ${lng}`, 'success');

    const latitude = typeof lat === 'string' ? parseFloat(lat) : lat;
    const longitude = typeof lng === 'string' ? parseFloat(lng) : lng;

    if (isNaN(latitude) || isNaN(longitude)) {
        addDebugLog('Coordenadas no válidas', 'error');
        return;
    }

    addToHistory(latitude, longitude, data);

    if (currentMode === 'route') {
        addToRoute(latitude, longitude);
    }

    // Si estamos grabando una ruta, añadir punto
    if (isRecordingRoute) {
        addPointToCurrentRoute(latitude, longitude);
    }

    updateMap(latitude, longitude, data);
    updateUserInfo(data);
    checkGeofences(latitude, longitude);
}

// ========== SISTEMA DE RUTAS ==========
function startRecordingRoute() {
    if (isRecordingRoute) {
        showNotification('Ya en grabación', 'Ya estás grabando una ruta', 'warning');
        return;
    }

    isRecordingRoute = true;
    currentRoute = {
        id: 'route-' + Date.now(),
        name: 'Ruta ' + new Date().toLocaleTimeString(),
        points: [],
        startTime: new Date(),
        endTime: null,
        distance: 0
    };

    addDebugLog('Iniciando grabación de ruta', 'success');
    showNotification('Grabación iniciada', 'Se ha comenzado a grabar tu ruta', 'success');

    // Actualizar interfaz
    document.getElementById('btn-start-recording').classList.add('active');
    document.getElementById('btn-stop-recording').classList.remove('disabled');
}

function stopRecordingRoute() {
    if (!isRecordingRoute) {
        showNotification('No hay grabación', 'No hay ninguna ruta en grabación', 'warning');
        return;
    }

    isRecordingRoute = false;
    currentRoute.endTime = new Date();

    // Guardar ruta
    recordedRoutes.push({...currentRoute});
    saveRoutesToStorage();

    addDebugLog(`Ruta guardada: ${currentRoute.points.length} puntos, ${currentRoute.distance.toFixed(2)} km`, 'success');
    showNotification('Ruta guardada', `Se ha guardado tu ruta con ${currentRoute.points.length} puntos`, 'success');

    // Actualizar interfaz
    document.getElementById('btn-start-recording').classList.remove('active');
    document.getElementById('btn-stop-recording').classList.add('disabled');

    // Dibujar ruta en el mapa
    drawRouteOnMap(currentRoute);
}

function addPointToCurrentRoute(lat, lng) {
    if (!isRecordingRoute) return;

    const point = {
        lat: lat,
        lng: lng,
        timestamp: new Date()
    };

    // Calcular distancia si hay puntos anteriores
    if (currentRoute.points.length > 0) {
        const lastPoint = currentRoute.points[currentRoute.points.length - 1];
        const distance = calculateDistance(lastPoint.lat, lastPoint.lng, lat, lng);
        currentRoute.distance += distance;
    }

    currentRoute.points.push(point);
    addDebugLog(`Punto añadido a ruta: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'info');
}

function viewSavedRoutes() {
    loadRoutesFromStorage();
    const routesPanel = document.getElementById('routes-panel');
    routesPanel.classList.toggle('active');

    const routesList = document.getElementById('routes-list');
    routesList.innerHTML = '';

    if (recordedRoutes.length === 0) {
        routesList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No hay rutas guardadas</div>';
        return;
    }

    recordedRoutes.forEach((route, index) => {
        const routeItem = document.createElement('div');
        routeItem.className = 'route-item';
        routeItem.innerHTML = `
            <div style="font-weight: 600;">${route.name}</div>
            <div style="font-size: 11px; color: #666;">
                ${route.points.length} puntos · ${route.distance.toFixed(2)} km
            </div>
        `;

        routeItem.addEventListener('click', () => {
            // Remover activo de todos los items
            document.querySelectorAll('.route-item').forEach(item => {
                item.classList.remove('active');
            });
            // Activar este item
            routeItem.classList.add('active');
            // Mostrar esta ruta en el mapa
            showRouteOnMap(route);
        });

        routesList.appendChild(routeItem);
    });
}

function showRouteOnMap(route) {
    // Limpiar ruta anterior
    if (map.getSource('saved-route')) {
        map.removeLayer('saved-route');
        map.removeSource('saved-route');
    }

    // Convertir puntos a coordenadas para Mapbox
    const coordinates = route.points.map(point => [point.lng, point.lat]);

    // Añadir fuente y capa para la ruta
    map.addSource('saved-route', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': coordinates
            }
        }
    });

    map.addLayer({
        'id': 'saved-route',
        'type': 'line',
        'source': 'saved-route',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#e74c3c',
            'line-width': 4,
            'line-opacity': 0.8
        }
    });

    // Añadir marcadores para inicio y fin
    if (route.points.length > 0) {
        // Marcador de inicio
        new mapboxgl.Marker({ color: '#2ecc71' })
            .setLngLat([route.points[0].lng, route.points[0].lat])
            .setPopup(new mapboxgl.Popup().setHTML(`
                <div class="route-popup">
                    <strong>Inicio de ruta</strong><br>
                    ${route.name}<br>
                    <div class="route-stats">
                        <div class="route-stat">
                            <div class="route-stat-value">${route.points.length}</div>
                            <div class="route-stat-label">Puntos</div>
                        </div>
                        <div class="route-stat">
                            <div class="route-stat-value">${route.distance.toFixed(2)}</div>
                            <div class="route-stat-label">km</div>
                        </div>
                    </div>
                </div>
            `))
            .addTo(map);

        // Marcador de fin
        new mapboxgl.Marker({ color: '#e74c3c' })
            .setLngLat([route.points[route.points.length - 1].lng, route.points[route.points.length - 1].lat])
            .setPopup(new mapboxgl.Popup().setHTML(`
                <div class="route-popup">
                    <strong>Fin de ruta</strong><br>
                    ${route.name}<br>
                    <div class="route-stats">
                        <div class="route-stat">
                            <div class="route-stat-value">${route.points.length}</div>
                            <div class="route-stat-label">Puntos</div>
                        </div>
                        <div class="route-stat">
                            <div class="route-stat-value">${route.distance.toFixed(2)}</div>
                            <div class="route-stat-label">km</div>
                        </div>
                    </div>
                </div>
            `))
            .addTo(map);
    }

    // Ajustar vista para mostrar toda la ruta
    if (coordinates.length > 0) {
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        map.fitBounds(bounds, {
            padding: 50,
            duration: 1000
        });
    }
}

function drawRouteOnMap(route) {
    showRouteOnMap(route);
}

function saveRoutesToStorage() {
    localStorage.setItem('recordedRoutes', JSON.stringify(recordedRoutes));
}

function loadRoutesFromStorage() {
    const saved = localStorage.getItem('recordedRoutes');
    if (saved) {
        recordedRoutes = JSON.parse(saved);
    }
}

// ========== GESTIÓN DE RUTAS EN TIEMPO REAL ==========
function addToRoute(lat, lng) {
    routeCoordinates.push([lng, lat]);
    drawRoute();
}

function drawRoute() {
    if (map.getSource('route')) {
        map.removeLayer('route');
        map.removeSource('route');
    }

    if (routeCoordinates.length > 1) {
        map.addSource('route', {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': {
                    'type': 'LineString',
                    'coordinates': routeCoordinates
                }
            }
        });

        map.addLayer({
            'id': 'route',
            'type': 'line',
            'source': 'route',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-color': '#3887be',
                'line-width': 5,
                'line-opacity': 0.75
            }
        });
    }
}

function clearRoute() {
    routeCoordinates = [];
    if (map.getSource('route')) {
        map.removeLayer('route');
        map.removeSource('route');
    }
}

// ========== GESTIÓN DE HISTORIAL ==========
function addToHistory(lat, lng, data) {
    const historyItem = {
        lat: lat,
        lng: lng,
        timestamp: new Date(),
        data: data
    };

    locationHistory.unshift(historyItem);

    if (locationHistory.length > 50) {
        locationHistory.pop();
    }

    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    locationHistory.slice(0, 10).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        const time = item.timestamp.toLocaleTimeString();
        const coords = `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`;

        historyItem.innerHTML = `
            <div class="history-time">${time}</div>
            <div class="history-coords">${coords}</div>
        `;

        historyList.appendChild(historyItem);
    });
}

function clearHistory() {
    locationHistory = [];
    updateHistoryDisplay();
    addDebugLog('Historial limpiado', 'info');
}

// ========== GEOCERCAS IRREGULARES MEJORADAS ==========
function startDrawingGeofence() {
    if (!map) {
        showNotification('Error', 'El mapa no está disponible', 'error');
        return;
    }

    isDrawingGeofence = true;
    currentGeofencePoints = [];
    document.getElementById('drawing-controls').classList.add('active');

    // Cambiar el cursor del mapa para indicar modo dibujo
    map.getCanvas().style.cursor = 'crosshair';

    // Añadir evento de clic al mapa para agregar puntos
    map.on('click', addGeofencePoint);

    addDebugLog('Modo dibujo de geocerca activado', 'info');
    showNotification('Dibujando geocerca', 'Haz clic en el mapa para añadir puntos al polígono', 'info');
}

function addGeofencePoint(e) {
    if (!isDrawingGeofence) return;

    const point = [e.lngLat.lng, e.lngLat.lat];
    currentGeofencePoints.push(point);

    // Añadir marcador para el punto con mayor precisión
    const markerElement = document.createElement('div');
    markerElement.className = 'geofence-marker';
    
    const marker = new mapboxgl.Marker({
        element: markerElement,
        draggable: false
    })
    .setLngLat(point)
    .addTo(map);

    geofenceMarkers.push(marker);

    // Dibujar líneas entre puntos con mayor precisión
    if (currentGeofencePoints.length > 1) {
        drawGeofenceLines();
    }

    addDebugLog(`Punto añadido: ${point[1].toFixed(6)}, ${point[0].toFixed(6)}`, 'success');
}

function drawGeofenceLines() {
    // Eliminar líneas anteriores
    geofenceLines.forEach(line => line.remove());
    geofenceLines = [];

    // Dibujar líneas entre puntos consecutivos con mayor precisión
    for (let i = 0; i < currentGeofencePoints.length - 1; i++) {
        const start = currentGeofencePoints[i];
        const end = currentGeofencePoints[i + 1];
        
        // Calcular distancia y ángulo entre puntos
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Crear elemento de línea
        const lineElement = document.createElement('div');
        lineElement.className = 'geofence-line';
        lineElement.style.width = `${distance * 100000}px`;
        lineElement.style.transform = `rotate(${angle}deg)`;
        
        const lineMarker = new mapboxgl.Marker({
            element: lineElement
        })
        .setLngLat(start)
        .addTo(map);

        geofenceLines.push(lineMarker);
    }
    
    // Dibujar línea de cierre si hay al menos 3 puntos
    if (currentGeofencePoints.length > 2) {
        const start = currentGeofencePoints[currentGeofencePoints.length - 1];
        const end = currentGeofencePoints[0];
        
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        const lineElement = document.createElement('div');
        lineElement.className = 'geofence-line';
        lineElement.style.width = `${distance * 100000}px`;
        lineElement.style.transform = `rotate(${angle}deg)`;
        
        const lineMarker = new mapboxgl.Marker({
            element: lineElement
        })
        .setLngLat(start)
        .addTo(map);

        geofenceLines.push(lineMarker);
    }
}

function finishGeofence() {
    if (currentGeofencePoints.length < 3) {
        showNotification('Error', 'Se necesitan al menos 3 puntos para crear un polígono', 'error');
        return;
    }

    // Mostrar modal de confirmación
    showConfirmationModal();
}

function showConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    const pointCount = document.getElementById('point-count');
    pointCount.textContent = currentGeofencePoints.length;
    modal.style.display = 'flex';
}

function hideConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = 'none';
}

function cancelGeofence() {
    isDrawingGeofence = false;
    document.getElementById('drawing-controls').classList.remove('active');
    map.getCanvas().style.cursor = '';
    map.off('click', addGeofencePoint);

    // Eliminar marcadores y líneas temporales
    geofenceMarkers.forEach(marker => marker.remove());
    geofenceLines.forEach(line => line.remove());

    geofenceMarkers = [];
    geofenceLines = [];
    currentGeofencePoints = [];

    addDebugLog('Dibujo de geocerca cancelado', 'info');
}

function saveGeofence() {
    const name = document.getElementById('geofence-name').value || 'Geocerca sin nombre';

    if (currentGeofencePoints.length < 3) {
        showNotification('Error', 'Se necesitan al menos 3 puntos para crear un polígono', 'error');
        return;
    }

    const geofence = {
        id: 'geofence-' + Date.now(),
        name: name,
        points: [...currentGeofencePoints], // Copia de los puntos
        type: 'polygon'
    };

    geofences.push(geofence);
    drawGeofence(geofence);

    // Limpiar dibujo temporal
    cancelGeofence();
    hideGeofenceModal();
    hideConfirmationModal();

    addDebugLog(`Geocerca "${name}" creada con ${geofence.points.length} puntos`, 'success');
    showNotification('Geocerca creada', `"${name}" creada con ${geofence.points.length} puntos`, 'success');
}

function drawGeofence(geofence) {
    // Asegurarse de que el polígono esté cerrado
    const coordinates = [...geofence.points];
    if (coordinates.length > 0) {
        coordinates.push(coordinates[0]);
    }

    // Añadir fuente y capa para el polígono
    const sourceId = `geofence-${geofence.id}`;
    const layerId = `geofence-layer-${geofence.id}`;

    if (map.getSource(sourceId)) {
        map.removeLayer(layerId);
        map.removeSource(sourceId);
    }

    map.addSource(sourceId, {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [coordinates]
            },
            'properties': {
                'name': geofence.name
            }
        }
    });

    map.addLayer({
        'id': layerId,
        'type': 'fill',
        'source': sourceId,
        'layout': {},
        'paint': {
            'fill-color': '#0080ff',
            'fill-opacity': 0.2
        }
    });

    map.addLayer({
        'id': `${layerId}-outline`,
        'type': 'line',
        'source': sourceId,
        'layout': {},
        'paint': {
            'line-color': '#0080ff',
            'line-width': 2
        }
    });

    // Añadir popup al hacer clic en el polígono
    map.on('click', layerId, (e) => {
        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
                <div style="padding: 10px;">
                    <strong>${geofence.name}</strong><br>
                    Tipo: Polígono<br>
                    Puntos: ${geofence.points.length}
                </div>
            `)
            .addTo(map);
    });

    // Cambiar cursor al pasar sobre el polígono
    map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
    });
}

function checkGeofences(lat, lng) {
    geofences.forEach(geofence => {
        if (geofence.type === 'polygon' && isPointInPolygon([lng, lat], geofence.points)) {
            addDebugLog(`Usuario entró en geocerca "${geofence.name}"`, 'warning');
            showNotification(
                'Entrada en geocerca',
                `El usuario entró en "${geofence.name}"`,
                'warning'
            );
        }
    });
}

// Algoritmo para determinar si un punto está dentro de un polígono
function isPointInPolygon(point, polygon) {
    const x = point[0], y = point[1];
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
}

function clearGeofences() {
    // Eliminar todas las fuentes y capas de geocercas
    geofences.forEach(geofence => {
        const sourceId = `geofence-${geofence.id}`;
        const layerId = `geofence-layer-${geofence.id}`;

        if (map.getSource(sourceId)) {
            map.removeLayer(layerId);
            map.removeLayer(`${layerId}-outline`);
            map.removeSource(sourceId);
        }
    });

    geofences = [];
    addDebugLog('Geocercas eliminadas', 'info');
    showNotification('Geocercas eliminadas', 'Todas las geocercas han sido eliminadas', 'info');
}

// ========== ACTUALIZACIÓN DEL MAPA ==========
function updateMap(lat, lng, data) {
    addDebugLog(`Actualizando mapa: ${lat}, ${lng}`, 'success');

    if (!map) {
        initializeMap(lng, lat);
    }

    if (!marker) {
        marker = new mapboxgl.Marker({
            color: '#FF0000',
            draggable: false
        })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup().setHTML(`
            <div style="padding: 10px; min-width: 200px;">
                <strong>Ubicación en Tiempo Real</strong><br><br>
                <strong>Usuario:</strong> ${data.idUsuario ? data.idUsuario.substring(0, 8) + '...' : 'Invitado'}<br>
                <strong>Dispositivo:</strong> ${data.marcaDispositivo || 'N/A'}<br>
                <strong>Batería:</strong> ${data.nivelBateria || 'N/A'}%<br>
                <strong>Precisión:</strong> ${data.precision || 'N/A'}m<br>
                <strong>Coordenadas:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
                <strong>Actualizado:</strong> ${new Date().toLocaleTimeString()}
            </div>
        `))
        .addTo(map);

        addDebugLog('Marcador creado en el mapa', 'success');
    } else {
        marker.setLngLat([lng, lat]);
    }

    if (isFirstLoad) {
        map.flyTo({
            center: [lng, lat],
            zoom: 15,
            duration: 2000
        });
        isFirstLoad = false;
        addDebugLog('Mapa centrado en ubicación', 'success');
    }
}

// ========== ACTUALIZAR INFORMACIÓN DEL USUARIO ==========
function updateUserInfo(data) {
    document.getElementById('user-id').textContent = data.idUsuario ?
        data.idUsuario.substring(0, 8) + '...' : 'Invitado';
    document.getElementById('device-info').textContent = data.marcaDispositivo || 'N/A';

    const batteryLevel = data.nivelBateria || 0;
    document.getElementById('battery-level').textContent = `${batteryLevel}%`;
    const batteryFill = document.getElementById('battery-fill');
    batteryFill.style.width = `${batteryLevel}%`;

    if (batteryLevel < 20) {
        batteryFill.className = 'battery-fill danger';
    } else if (batteryLevel < 50) {
        batteryFill.className = 'battery-fill warning';
    } else {
        batteryFill.className = 'battery-fill';
    }

    document.getElementById('accuracy').textContent = data.precision ?
        `${data.precision}m` : 'N/A';
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
}

// ========== INICIALIZACIÓN DEL MAPA ==========
function initializeMap(lng, lat) {
    addDebugLog('Inicializando mapa...', 'info');

    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [lng || -68.119, lat || -16.503],
        zoom: 10
    });

    map.on('load', () => {
        addDebugLog('Mapa cargado correctamente', 'success');

        // Inicializar listener de Firestore
        setTimeout(() => {
            initializeFirestoreListener();
        }, 1000);
    });

    map.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        addDebugLog(`Clic en mapa: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'info');
    });

    map.on('error', (e) => {
        addDebugLog(`Error del mapa: ${e.error}`, 'error');
    });
}

// ========== FUNCIONES UTILITARIAS ==========
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ========== MANEJO DE EVENTOS ==========
document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);

// Botones de compartir
document.getElementById('btn-share-location').addEventListener('click', showShareModal);
document.getElementById('btn-generate-qr').addEventListener('click', function() {
    showShareModal();
    generateQRCode();
});

// Opciones de compartir
document.getElementById('share-whatsapp').addEventListener('click', shareOnWhatsApp);
document.getElementById('share-telegram').addEventListener('click', shareOnTelegram);
document.getElementById('share-link').addEventListener('click', function() {
    document.getElementById('link-container').style.display = 'flex';
    document.getElementById('qr-container').style.display = 'none';
});
document.getElementById('share-qr').addEventListener('click', generateQRCode);
document.getElementById('copy-link').addEventListener('click', function() {
    copyToClipboard(shareUrl);
});

// Cerrar modales
document.getElementById('close-share-modal').addEventListener('click', hideShareModal);

// Modos de visualización
document.getElementById('btn-live').addEventListener('click', function() {
    setActiveButton('btn-live');
    currentMode = 'live';
    clearRoute();
    addDebugLog('Modo cambiado: Tiempo Real', 'info');
});

document.getElementById('btn-route').addEventListener('click', function() {
    setActiveButton('btn-route');
    currentMode = 'route';
    addDebugLog('Modo cambiado: Visualizar Ruta', 'info');
});

document.getElementById('btn-history').addEventListener('click', function() {
    setActiveButton('btn-history');
    currentMode = 'history';
    addDebugLog('Modo cambiado: Ver Historial', 'info');
});

// Geocercas
document.getElementById('btn-add-geofence').addEventListener('click', startDrawingGeofence);
document.getElementById('btn-finish-geofence').addEventListener('click', finishGeofence);
document.getElementById('btn-cancel-geofence').addEventListener('click', cancelGeofence);
document.getElementById('save-geofence').addEventListener('click', saveGeofence);
document.getElementById('btn-clear-geofences').addEventListener('click', clearGeofences);

// Rutas
document.getElementById('btn-start-recording').addEventListener('click', startRecordingRoute);
document.getElementById('btn-stop-recording').addEventListener('click', stopRecordingRoute);
document.getElementById('btn-view-routes').addEventListener('click', viewSavedRoutes);
document.getElementById('btn-close-routes').addEventListener('click', function() {
    document.getElementById('routes-panel').classList.remove('active');
});

// Cerrar modal de geocercas
document.getElementById('cancel-geofence').addEventListener('click', function() {
    hideGeofenceModal();
    cancelGeofence();
});
document.getElementById('close-geofence-modal').addEventListener('click', function() {
    hideGeofenceModal();
    cancelGeofence();
});

// Confirmación de geocerca
document.getElementById('confirm-save').addEventListener('click', function() {
    hideConfirmationModal();
    showGeofenceModal();
});

document.getElementById('confirm-cancel').addEventListener('click', function() {
    hideConfirmationModal();
    cancelGeofence();
});

function showGeofenceModal() {
    const modal = document.getElementById('geofence-modal');
    modal.style.display = 'flex';
}

function hideGeofenceModal() {
    const modal = document.getElementById('geofence-modal');
    modal.style.display = 'none';
}

// Configuración
document.getElementById('btn-night-mode').addEventListener('click', function() {
    isNightMode = !isNightMode;
    document.body.classList.toggle('night-mode', isNightMode);
    addDebugLog(`Modo noche ${isNightMode ? 'activado' : 'desactivado'}`, 'info');
});

document.getElementById('btn-fullscreen').addEventListener('click', function() {
    if (!isFullscreen) {
        document.documentElement.requestFullscreen();
        isFullscreen = true;
    } else {
        document.exitFullscreen();
        isFullscreen = false;
    }
});

document.getElementById('btn-debug').addEventListener('click', function() {
    const debugPanel = document.getElementById('debug-panel');
    debugPanel.style.display = debugPanel.style.display === 'block' ? 'none' : 'block';
});

document.getElementById('btn-clear-history').addEventListener('click', clearHistory);

document.getElementById('btn-clear-logs').addEventListener('click', function() {
    document.getElementById('debug-logs').innerHTML = '';
});

// Controles flotantes
document.getElementById('btn-center-map').addEventListener('click', function() {
    if (marker) {
        const lngLat = marker.getLngLat();
        map.flyTo({
            center: [lngLat.lng, lngLat.lat],
            zoom: 15,
            duration: 1000
        });
        addDebugLog('Mapa centrado en ubicación actual', 'info');
    }
});

document.getElementById('btn-zoom-in').addEventListener('click', function() {
    map.zoomIn();
});

document.getElementById('btn-zoom-out').addEventListener('click', function() {
    map.zoomOut();
});

function setActiveButton(activeId) {
    document.querySelectorAll('.btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(activeId).classList.add('active');
}

// ========== INICIALIZACIÓN DE LA APLICACIÓN ==========
function initializeApp() {
    addDebugLog('Iniciando aplicación de rastreo avanzado...', 'info');
    updateStatus('Iniciando...', false);

    // Generar URL de compartir
    generateShareUrl();

    // Cargar rutas guardadas
    loadRoutesFromStorage();

    initializeMap();
}

// ========== INICIAR TODO ==========
document.addEventListener('DOMContentLoaded', initializeApp);