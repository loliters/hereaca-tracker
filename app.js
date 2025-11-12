// ========== CONFIGURACIÓN ==========
const firebaseConfig = {
    apiKey: "AIzaSyAoIgegIOOMtnXY8P-z7ktj0Mf98eUoYwk",
    authDomain: "hereaca.firebaseapp.com",
    projectId: "hereaca",
    storageBucket: "hereaca.firebasestorage.app",
    messagingSenderId: "554391595579",
    appId: "1:554391595579:android:aa94be82ce48a0b39f0a1e"
};

// ========== INICIALIZACIÓN ==========
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth()
mapboxgl.accessToken = 'pk.eyJ1IjoiY2VjaWxpYXRhcmlmYTAwIiwiYSI6ImNtZnU2NHp2ZTExdTYyanBvNHVrc2hwcTMifQ.tZj5j0FWDcRHNkzYU-t0SQ';
// Configuración de Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
    'prompt': 'select_account'
});
// Configuración de límites
const GEOFFENCE_CONFIG = {
    MIN_POINTS: 3,
    MAX_POINTS: 7,
    CLOSE_DISTANCE: 0.0002 // Distancia para cierre automático (~15 metros)
};

// Variables para edición de geocercas
let isEditingGeofence = false;
let currentEditingGeofence = null;
let originalGeofencePoints = [];
let editMarkers = [];

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
        logEntry.style.color = '#e74c3c';
    } else if (type === 'success') {
        logEntry.style.color = '#2ecc71';
    } else if (type === 'warning') {
        logEntry.style.color = '#f39c12';
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
// ========== SISTEMA DE AUTENTICACIÓN ==========
let isUserLoggedIn = false;

function checkAuthState() {
    return new Promise((resolve) => {
        auth.onAuthStateChanged((user) => {
            if (user) {
                isUserLoggedIn = true;
                currentUserId = user.uid;

                console.log("✅ Usuario autenticado:", {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    photoURL: user.photoURL
                });

                // Actualizar UI
                updateUserUI(user);

                showNotification('Sesión iniciada', `Bienvenido ${user.displayName || user.email}`, 'success');
                resolve(true);
            } else {
                isUserLoggedIn = false;
                currentUserId = '';
                console.log("❌ Usuario no autenticado");

                // Actualizar UI para usuario no autenticado
                updateUserUI(null);
                resolve(false);
            }
        }, (error) => {
            console.error("Error en auth state:", error);
            resolve(false);
        });
    });
}

function updateUserUI(user) {
    const userDisplayName = document.getElementById('user-display-name');
    const userRole = document.getElementById('user-role');
    const authBtn = document.getElementById('auth-btn');

    if (user) {
        if (userDisplayName) userDisplayName.textContent = user.displayName || user.email || 'Usuario';
        if (userRole) userRole.textContent = 'user';
        if (authBtn) {
            authBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Cerrar Sesión';
            authBtn.onclick = logout;
        }
    } else {
        if (userDisplayName) userDisplayName.textContent = 'Invitado';
        if (userRole) userRole.textContent = 'invitado';
        if (authBtn) {
            // CAMBIO: Texto más descriptivo
            authBtn.innerHTML = '<i class="fas fa-user"></i> Iniciar Sesión';
            authBtn.onclick = showLoginOptions; // CAMBIO: Nueva función
        }
    }
}



function showLoginOptions() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-modal-content">
            <div class="auth-modal-header">
                <h3>Opciones de Inicio de Sesión</h3>
                <button class="auth-modal-close">&times;</button>
            </div>
            <div class="auth-modal-body">
                <p>Puedes usar la aplicación como invitado o iniciar sesión para sincronizar tus datos.</p>

                <div class="auth-buttons">
                    <button id="btn-login-google" class="btn btn-google">
                        <i class="fab fa-google"></i> Iniciar con Google
                    </button>

                    <button id="btn-continue-guest" class="btn btn-primary">
                        <i class="fas fa-play"></i> Continuar como Invitado
                    </button>
                </div>

                <div class="auth-terms">
                    <small>Al continuar, aceptas nuestros <a href="#">términos y condiciones</a></small>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.auth-modal-close');
    const googleBtn = modal.querySelector('#btn-login-google');
    const guestBtn = modal.querySelector('#btn-continue-guest');

    const closeModal = () => {
        modal.remove();
    };

    closeBtn.addEventListener('click', closeModal);

    googleBtn.addEventListener('click', async () => {
        try {
            await loginWithGoogle();
            closeModal();
        } catch (error) {
            // Error manejado en loginWithGoogle
        }
    });

    guestBtn.addEventListener('click', () => {
        closeModal();
        showNotification('Modo invitado', 'Usando la aplicación como invitado', 'info');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

async function loginWithGoogle() {
    try {
        console.log("🔄 Iniciando login con Google...");

        // Usar firebase.auth() directamente para evitar conflictos
        const result = await firebase.auth().signInWithPopup(googleProvider);
        const user = result.user;

        console.log("✅ Login exitoso con Google:", user);
        showNotification('Éxito', `Bienvenido ${user.displayName || user.email}`, 'success');

        // Actualizar estado de autenticación
        isUserLoggedIn = true;
        currentUserId = user.uid;

        // Actualizar UI inmediatamente
        updateUserUI(user);

        return user;

    } catch (error) {
        console.error('❌ Error en login con Google:', error);

        let errorMessage = 'No se pudo iniciar sesión con Google';

        // Manejo específico de errores
        if (error.code === 'auth/popup-blocked') {
            errorMessage = 'El popup fue bloqueado. Por favor, permite ventanas emergentes para este sitio.';
        } else if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Cerraste la ventana de inicio de sesión. Intenta de nuevo.';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Error de conexión. Verifica tu internet.';
        } else if (error.code === 'auth/unauthorized-domain') {
            errorMessage = 'Dominio no autorizado. Contacta al administrador.';
        } else {
            errorMessage = `Error: ${error.message}`;
        }

        showNotification('Error', errorMessage, 'error');
        throw error;
    }
}
// Manejar el resultado del redirect (si usas signInWithRedirect)
function handleRedirectResult() {
    firebase.auth().getRedirectResult().then((result) => {
        if (result.user) {
            console.log("✅ Login por redirect exitoso:", result.user);
            const user = result.user;
            isUserLoggedIn = true;
            currentUserId = user.uid;
            updateUserUI(user);
            showNotification('Éxito', `Bienvenido ${user.displayName || user.email}`, 'success');
        }
    }).catch((error) => {
        console.error("❌ Error en redirect result:", error);
        // No mostrar notificación aquí para no molestar al usuario
    });
}
async function loginAnonymously() {
    try {
        await firebase.auth().signInAnonymously();
        showNotification('Modo invitado', 'Sesión iniciada como invitado', 'info');
    } catch (error) {
        console.error('Error en login anónimo:', error);
        showNotification('Error', 'No se pudo iniciar sesión', 'error');
    }
}

function logout() {
    firebase.auth().signOut().then(() => {
        console.log("✅ Sesión cerrada correctamente");
        showNotification('Sesión cerrada', 'Has cerrado sesión correctamente', 'info');
    }).catch((error) => {
        console.error("❌ Error al cerrar sesión:", error);
        showNotification('Error', 'No se pudo cerrar la sesión', 'error');
    });
}
// ========== FUNCIONES PARA GUARDAR GEOCERCAS EN FIREBASE ==========

// Función para guardar geocerca en Firebase (CORREGIDA para arrays)
async function saveGeofenceToFirebase(geofence) {
    try {
        const user = firebase.auth().currentUser;
        let userId = 'web_user_anonymous';

        if (user) {
            userId = user.uid;
        } else {
            let webUserId = localStorage.getItem('web_user_id');
            if (!webUserId) {
                webUserId = 'web_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('web_user_id', webUserId);
            }
            userId = webUserId;
        }

        // CONVERTIR puntos a formato compatible con Firestore
        const pointsForFirestore = geofence.points ?
            geofence.points.map(point => ({
                latitude: point[1], // [lng, lat] -> convertimos a objeto
                longitude: point[0]
            })) : [];

        const geofenceData = {
            name: geofence.name,
            type: geofence.type || 'polygon',
            color: geofence.color,
            radius: geofence.radio || 200,
            activa: true,
            idUsuario: userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: 'web_app',
            version: '1.0',
            points: pointsForFirestore, // Ahora es array de objetos, no array de arrays
            pointCount: pointsForFirestore.length
        };

        console.log("📤 Guardando en Firebase con datos:", geofenceData);

        let docRef;
        if (geofence.id && geofence.id.startsWith('geocerca_')) {
            docRef = await db.collection("geofences").doc(geofence.id).set(geofenceData);
            console.log("✅ Geocerca actualizada en Firebase con ID:", geofence.id);
        } else {
            const newId = 'geocerca_' + Date.now();
            docRef = await db.collection("geofences").doc(newId).set(geofenceData);
            on("geofences").doc(newId).set(geofenceData);
            geofence.id = newId;
            console.log("✅ Nueva geocerca creada en Firebase con ID:", newId);
        }

        addDebugLog(`Geocerca "${geofence.name}" guardada en Firebase`, 'success');
        return docRef;
    } catch (error) {
        console.error('❌ Error guardando geocerca en Firebase:', error);
        addDebugLog(`Error guardando en Firebase: ${error.message}`, 'error');
        throw error;
    }
}
// Función para verificar que la geocerca se guardó en Firebase
async function verifyGeofenceInFirebase(geofenceId) {
    try {
        const doc = await db.collection("geofences").doc(geofenceId).get();
        if (doc.exists) {
            console.log("✅ VERIFICACIÓN: Geocerca encontrada en Firebase:", doc.data());
            addDebugLog(`Geocerca verificada en Firebase: ${geofenceId}`, 'success');
        } else {
            console.log("❌ VERIFICACIÓN: Geocerca NO encontrada en Firebase");
            addDebugLog(`Geocerca NO encontrada en Firebase: ${geofenceId}`, 'error');
        }
    } catch (error) {
        console.error("❌ Error en verificación:", error);
    }
}

// Función para guardar geocerca
async function saveGeofenceDirectly(points) {
    console.log("💾 Guardando geocerca en Firebase...");

    const name = `Geocerca Web ${new Date().toLocaleTimeString()}`;

    const geofence = {
        id: 'geocerca_' + Date.now(),
        name: name,
        points: points,
        type: 'polygon',
        color: getRandomColor(),
        createdAt: new Date().toISOString(),
        pointCount: points.length - 1,
        radio: 200,
        activa: true
    };

    console.log("Geocerca a guardar:", geofence);

    try {
        await saveGeofenceToFirebase(geofence);
        geofences.push(geofence);
        drawGeofence(geofence);
        cancelGeofence();
        showNotification('✅ Geocerca creada', `"${name}" guardada en Firebase`, 'success');
        console.log("🎉 Geocerca guardada en Firebase exitosamente!");
    } catch (error) {
        console.error("Error guardando en Firebase, guardando localmente:", error);
        geofences.push(geofence);
        saveGeofencesToStorage();
        drawGeofence(geofence);
        cancelGeofence();
        showNotification('⚠️ Geocerca guardada local', `"${name}" guardada localmente (sin conexión)`, 'warning');
    }
}

// Función para cargar geocercas desde Firebase (ACTUALIZADA)
async function loadGeofencesFromFirebase() {
    try {
        const user = firebase.auth().currentUser;
        let userId = 'web_user_anonymous';

        if (user) {
            userId = user.uid;
        } else {
            userId = localStorage.getItem('web_user_id') || 'web_user_anonymous';
        }

        console.log("🔄 Cargando geocercas para usuario:", userId);

        const snapshot = await db.collection("geofences")
            .where("idUsuario", "==", userId)
            .orderBy("createdAt", "desc")
            .get();

        geofences = [];
        clearAllGeofencesFromMap();

        let loadedCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log("📥 Geocerca cargada desde Firebase:", data);

            // Crear objeto geocerca compatible
            const geofence = {
                id: doc.id,
                name: data.name || data.nombre || 'Geocerca sin nombre',
                type: data.type || data.tipo || 'polygon',
                color: data.color || getRandomColor(),
                activa: data.activa !== false,
                userId: data.idUsuario,
                createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
                createdBy: data.createdBy || 'web_app'
            };

            // Manejar diferentes tipos de geocercas
            if (geofence.type === 'circular' && data.center) {
                geofence.center = data.center;
                geofence.radius = data.radius || data.radio || 200;
            } else {
                // Geocerca poligonal
                geofence.points = data.points || data.puntos || [];
                geofence.pointCount = data.pointCount || geofence.points.length;
            }

            if ((geofence.points && geofence.points.length >= 3) || geofence.center) {
                geofences.push(geofence);
                drawGeofence(geofence);
                loadedCount++;
            }
        });

        addDebugLog(`✅ Cargadas ${loadedCount} geocercas desde Firebase`, 'success');
        saveGeofencesToStorage();

    } catch (error) {
        console.error('❌ Error cargando geocercas desde Firebase:', error);
        addDebugLog(`Error cargando desde Firebase: ${error.message}`, 'error');
        loadGeofencesFromStorage();
    }
}

// Función para limpiar todas las geocercas del mapa
function clearAllGeofencesFromMap() {
    if (!map) return;

    geofences.forEach(geofence => {
        const sourceId = `geofence-${geofence.id}`;
        const layerFillId = `geofence-fill-${geofence.id}`;
        const layerLineId = `geofence-line-${geofence.id}`;

        if (map.getSource(sourceId)) {
            map.removeLayer(layerFillId);
            map.removeLayer(layerLineId);
            map.removeSource(sourceId);
        }
    });
}

// Función para eliminar geocerca de Firebase
async function deleteGeofenceFromFirebase(geofenceId) {
    try {
        await db.collection("geofences").doc(geofenceId).delete();
        addDebugLog(`Geocerca eliminada de Firebase: ${geofenceId}`, 'info');
    } catch (error) {
        console.error('Error eliminando de Firebase:', error);
        addDebugLog(`Error eliminando de Firebase: ${error.message}`, 'error');
    }
}

// ========== FUNCIONES DE INICIALIZACIÓN ==========

async function initializeFirestoreGeofences() {
    try {
        const testQuery = await db.collection("geofences").limit(1).get();
        console.log("Colección 'geofences' verificada correctamente");
        return true;
    } catch (error) {
        console.log("La colección 'geofences' no existe o hay error de permisos:", error);
        return false;
    }
}

async function initializeAuth() {
    try {
        console.log("Inicializando Firebase y geocercas...");
        await initializeFirestoreGeofences();
        await loadGeofencesFromFirebase();
        addDebugLog('Geocercas cargadas desde Firebase', 'success');
    } catch (error) {
        console.error('Error inicializando geocercas:', error);
        addDebugLog('Cargando geocercas locales: ' + error.message, 'warning');
        loadGeofencesFromStorage();
    }
}

// ========== FUNCIONES DE DEBUG PARA FIREBASE ==========

async function debugFirebaseState() {
    console.log("=== DEBUG FIREBASE STATE ===");

    try {
        const testDoc = await db.collection("geofences").limit(1).get();
        console.log("✅ Firestore conectado correctamente");

        const user = firebase.auth().currentUser;
        console.log("Usuario actual:", user ? user.uid : 'Anónimo');

        const geofencesSnapshot = await db.collection("geofences").limit(5).get();
        console.log(`Geocercas en Firebase: ${geofencesSnapshot.size}`);

        geofencesSnapshot.forEach(doc => {
            console.log(`- ${doc.id}:`, doc.data());
        });

    } catch (error) {
        console.error("❌ Error en Firebase:", error);
    }
}

function addDebugButton() {
    const debugBtn = document.createElement('button');
    debugBtn.id = 'btn-debug-firebase';
    debugBtn.className = 'btn btn-warning';
    debugBtn.innerHTML = `
        <i class="fas fa-bug"></i>
        <div>
            <div>Debug Firebase</div>
            <small>Probar conexión</small>
        </div>
    `;
    debugBtn.addEventListener('click', debugFirebaseState);

    const controls = document.querySelector('.map-controls');
    if (controls) {
        controls.appendChild(debugBtn);
    }
}

function addSyncButton() {
    const syncButton = document.createElement('button');
    syncButton.id = 'btn-sync-geofences';
    syncButton.className = 'btn btn-info';
    syncButton.innerHTML = `
        <i class="fas fa-sync-alt"></i>
        <div>
            <div>Sincronizar</div>
            <small>Actualizar geocercas</small>
        </div>
    `;
    syncButton.addEventListener('click', syncGeofences);

    const controls = document.querySelector('.map-controls');
    if (controls) {
        controls.appendChild(syncButton);
    }
}

async function syncGeofences() {
    showNotification('Sincronizando', 'Actualizando geocercas desde Firebase...', 'info');
    try {
        await loadGeofencesFromFirebase();
        showNotification('Sincronizado', 'Geocercas actualizadas correctamente', 'success');
    } catch (error) {
        showNotification('Error', 'No se pudieron actualizar las geocercas', 'error');
    }
}

// ========== FUNCIONES DE DIBUJO DE GEOCERCAS ==========

function startDrawingGeofence() {
    console.log("Iniciando dibujo de geocerca...");


      if (!map) {
            showNotification('Error', 'El mapa no está disponible', 'error');
            return;
        }

    if (isDrawingGeofence) {
        cancelGeofence();
    }

    isDrawingGeofence = true;
    currentGeofencePoints = [];
    geofenceMarkers = [];

    const drawingControls = document.getElementById('drawing-controls');
    if (drawingControls) {
        console.log("Mostrando drawing-controls...");
        drawingControls.classList.add('active');
        drawingControls.style.display = 'block';
        drawingControls.style.visibility = 'visible';
        drawingControls.style.opacity = '1';
        drawingControls.style.zIndex = '9999';
    } else {
        console.error("❌ No se encontró drawing-controls");
        return;
    }

    map.getCanvas().style.cursor = 'crosshair';
    map.off('click', handleGeofenceClick);
    map.on('click', handleGeofenceClick);

    // Agregar listener para tecla Enter (NUEVO)
    document.addEventListener('keydown', handleGeofenceKeydown);

    createTempGeofenceLayer();
    updateGeofenceUI();

    addDebugLog('Modo dibujo de geocerca activado', 'success');
    showNotification(
        'Dibujando geocerca',
        `Haz clic en el mapa para añadir puntos (mínimo ${GEOFFENCE_CONFIG.MIN_POINTS}). Presiona ENTER para finalizar.`,
        'info'
    );
}

// AGREGAR estas nuevas funciones para manejo de teclado:
function handleGeofenceKeydown(e) {
    if (!isDrawingGeofence) return;

    if (e.key === 'Enter') {
        e.preventDefault();
        if (currentGeofencePoints.length >= GEOFFENCE_CONFIG.MIN_POINTS) {
            finishGeofenceWithConfirmation();
        } else {
            showNotification(
                'Puntos insuficientes',
                `Necesitas al menos ${GEOFFENCE_CONFIG.MIN_POINTS} puntos para cerrar la geocerca`,
                'warning'
            );
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelGeofenceWithConfirmation();
    }
}

function finishGeofenceWithConfirmation() {
    if (currentGeofencePoints.length < GEOFFENCE_CONFIG.MIN_POINTS) {
        showNotification(
            'Puntos insuficientes',
            `Necesitas al menos ${GEOFFENCE_CONFIG.MIN_POINTS} puntos. Tienes: ${currentGeofencePoints.length}`,
            'warning'
        );
        return;
    }

    // Actualizar la información del modal
    document.getElementById('point-count').textContent = currentGeofencePoints.length;

    // Calcular área aproximada
    const area = calculatePolygonArea(currentGeofencePoints);
    const areaText = area > 10000 ?
        `${(area / 1000000).toFixed(2)} km²` :
        `${area.toFixed(0)} m²`;

    // Mostrar información de la geocerca
    const preview = document.getElementById('geofence-preview');
    preview.innerHTML = `
        <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
            <strong>Información de la geocerca:</strong><br>
            • Puntos: ${currentGeofencePoints.length}<br>
            • Área aproximada: ${areaText}<br>
            • Tipo: Polígono
        </div>
    `;

    // Mostrar el modal
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = 'flex';

    // Configurar event listeners para los botones del modal
    document.getElementById('confirm-save').onclick = function() {
        modal.style.display = 'none';
        finishGeofence();
    };

    document.getElementById('confirm-cancel').onclick = function() {
        modal.style.display = 'none';
        // Opcional: continuar dibujando o cancelar completamente
        showNotification('Dibujo cancelado', 'Puedes continuar editando la geocerca', 'info');
    };

    document.getElementById('close-confirmation-modal').onclick = function() {
        modal.style.display = 'none';
    };

    // Cerrar modal al hacer clic fuera
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    };
}

function cancelGeofenceWithConfirmation() {
    if (currentGeofencePoints.length === 0) {
        cancelGeofence();
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'confirmation-modal';
    modal.innerHTML = `
        <div class="confirmation-modal-content">
            <div class="confirmation-modal-header">
                <h3>Cancelar Geocerca</h3>
            </div>
            <div class="confirmation-modal-body">
                <p>¿Estás seguro de que quieres cancelar la geocerca?</p>
                <p><strong>Se perderán todos los puntos añadidos.</strong></p>
                <div class="confirmation-buttons">
                    <button id="btn-confirm-cancel" class="btn btn-danger">
                        <i class="fas fa-trash"></i> Sí, cancelar
                    </button>
                    <button id="btn-continue-drawing" class="btn btn-secondary">
                        <i class="fas fa-edit"></i> Continuar dibujando
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btn-confirm-cancel').addEventListener('click', () => {
        modal.remove();
        cancelGeofence();
        showNotification('Geocerca cancelada', 'Todos los puntos han sido eliminados', 'info');
    });

    modal.querySelector('#btn-continue-drawing').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}
function handleGeofenceClick(e) {
    if (!isDrawingGeofence) return;

    const newPoint = [e.lngLat.lng, e.lngLat.lat];
    console.log('Nuevo punto:', newPoint);

    // Verificar si estamos intentando cerrar el polígono
    if (currentGeofencePoints.length >= GEOFFENCE_CONFIG.MIN_POINTS) {
        const firstPoint = currentGeofencePoints[0];
        const distance = calculateDistanceBetweenPoints(newPoint, firstPoint);

        console.log(`Distancia al primer punto: ${distance}, Límite: ${GEOFFENCE_CONFIG.CLOSE_DISTANCE}`);

        if (distance < GEOFFENCE_CONFIG.CLOSE_DISTANCE) {
            console.log('¡Cierre automático detectado! Cerrando geocerca...');
            currentGeofencePoints.push([firstPoint[0], firstPoint[1]]);
            finishGeofence();
            return;
        }
    }

    // Verificar límite máximo de puntos
    if (currentGeofencePoints.length >= GEOFFENCE_CONFIG.MAX_POINTS) {
        showNotification(
            'Límite alcanzado',
            `Máximo ${GEOFFENCE_CONFIG.MAX_POINTS} puntos alcanzado. Cerrando automáticamente.`,
            'warning'
        );

        const firstPoint = currentGeofencePoints[0];
        currentGeofencePoints.push([firstPoint[0], firstPoint[1]]);
        finishGeofence();
        return;
    }

    // Añadir punto normal
    addGeofencePointToMap(newPoint);
    currentGeofencePoints.push(newPoint);
    updateTempGeofenceLayer();
    updateGeofenceUI();

    console.log(`Punto añadido. Total: ${currentGeofencePoints.length}`);

    if (currentGeofencePoints.length === 1) {
        showNotification(
            'Primer punto añadido',
            'Continúa añadiendo puntos. Para cerrar la geocerca, haz clic cerca del punto verde cuando tengas al menos 3 puntos.',
            'info'
        );
    }
}

function addGeofencePointToMap(point, isClosingPoint = false) {
    const markerElement = document.createElement('div');
    markerElement.className = 'geofence-marker';

    if (currentGeofencePoints.length === 0 || isClosingPoint) {
        markerElement.innerHTML = `
            <div class="first-point-marker">
                <div class="pulse-ring"></div>
                <div class="center-dot"></div>
            </div>
        `;
    } else {
        markerElement.innerHTML = '<div class="normal-point-marker"></div>';
    }

    const marker = new mapboxgl.Marker({
        element: markerElement,
        draggable: true
    })
    .setLngLat(point)
    .addTo(map);

    marker.on('dragend', () => {
        const newLngLat = marker.getLngLat();
        const index = geofenceMarkers.indexOf(marker);
        if (index !== -1) {
            currentGeofencePoints[index] = [newLngLat.lng, newLngLat.lat];
            updateTempGeofenceLayer();
            updateGeofenceUI();
        }
    });

    geofenceMarkers.push(marker);
}

function calculateDistanceBetweenPoints(point1, point2) {
    const dx = point1[0] - point2[0];
    const dy = point1[1] - point2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function updateGeofenceUI() {
    const pointCounter = document.getElementById('point-counter');
    const finishButton = document.getElementById('btn-finish-geofence');
    const minMaxInfo = document.querySelector('.min-max-info');

    if (pointCounter) {
        pointCounter.textContent = `Puntos: ${currentGeofencePoints.length}/${GEOFFENCE_CONFIG.MAX_POINTS}`;

        if (currentGeofencePoints.length < GEOFFENCE_CONFIG.MIN_POINTS) {
            pointCounter.style.color = '#e74c3c';
        } else if (currentGeofencePoints.length === GEOFFENCE_CONFIG.MAX_POINTS) {
            pointCounter.style.color = '#f39c12';
        } else {
            pointCounter.style.color = '#2ecc71';
        }
    }

    if (minMaxInfo && currentGeofencePoints.length > 0) {
        minMaxInfo.innerHTML = `
            <div>Mínimo: ${GEOFFENCE_CONFIG.MIN_POINTS} puntos • Máximo: ${GEOFFENCE_CONFIG.MAX_POINTS} puntos</div>
            <div><strong>Haz clic cerca del punto verde para cerrar</strong></div>
            <div>Puntos actuales: ${currentGeofencePoints.length}</div>
        `;
    }

    if (finishButton) {
        if (currentGeofencePoints.length >= GEOFFENCE_CONFIG.MIN_POINTS) {
            finishButton.disabled = false;
            finishButton.style.opacity = '1';
            finishButton.style.cursor = 'pointer';
            finishButton.innerHTML = `
                <i class="fas fa-check"></i>
                <div>
                    <div>Finalizar Geocerca</div>
                    <small>Listo para cerrar (${currentGeofencePoints.length} puntos)</small>
                </div>
            `;
        } else {
            finishButton.disabled = true;
            finishButton.style.opacity = '0.6';
            finishButton.style.cursor = 'not-allowed';
            finishButton.innerHTML = `
                <i class="fas fa-check"></i>
                <div>
                    <div>Finalizar Geocerca</div>
                    <small>Necesitas ${GEOFFENCE_CONFIG.MIN_POINTS - currentGeofencePoints.length} puntos más</small>
                </div>
            `;
        }
    }
}

function createTempGeofenceLayer() {
    if (map.getSource('temp-geofence')) {
        map.removeLayer('temp-geofence-fill');
        map.removeLayer('temp-geofence-line');
        map.removeSource('temp-geofence');
    }

    map.addSource('temp-geofence', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [[]]
            }
        }
    });

    map.addLayer({
        'id': 'temp-geofence-fill',
        'type': 'fill',
        'source': 'temp-geofence',
        'paint': {
            'fill-color': '#0080ff',
            'fill-opacity': 0.1,
            'fill-outline-color': '#0080ff'
        }
    });

    map.addLayer({
        'id': 'temp-geofence-line',
        'type': 'line',
        'source': 'temp-geofence',
        'paint': {
            'line-color': '#0080ff',
            'line-width': 2,
            'line-dasharray': [2, 1]
        }
    });
}

function updateTempGeofenceLayer() {
    if (!map.getSource('temp-geofence')) return;

    let coordinates = [];
    if (currentGeofencePoints.length >= 2) {
        coordinates = [[...currentGeofencePoints]];
        if (currentGeofencePoints.length >= 2) {
            coordinates[0].push(currentGeofencePoints[0]);
        }
    } else if (currentGeofencePoints.length === 1) {
        coordinates = [[currentGeofencePoints[0], currentGeofencePoints[0]]];
    } else {
        coordinates = [[]];
    }

    map.getSource('temp-geofence').setData({
        'type': 'Feature',
        'geometry': {
            'type': 'Polygon',
            'coordinates': coordinates
        }
    });
}

function finishGeofence() {
    console.log("=== FINISH GEOFENCE INICIADA ===");

    if (!isDrawingGeofence) {
        showNotification('Error', 'No hay una geocerca en proceso de dibujo', 'error');
        return;
    }

    if (currentGeofencePoints.length < GEOFFENCE_CONFIG.MIN_POINTS) {
        showNotification(
            'Error',
            `Se necesitan al menos ${GEOFFENCE_CONFIG.MIN_POINTS} puntos. Tienes: ${currentGeofencePoints.length}`,
            'error'
        );
        return;
    }

    // Crear polígono cerrado
    const uniquePoints = [...currentGeofencePoints];
    const firstPoint = uniquePoints[0];
    const lastPoint = uniquePoints[uniquePoints.length - 1];

    // Verificar si ya está cerrado
    const isClosed = firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1];

    if (!isClosed) {
        uniquePoints.push([firstPoint[0], firstPoint[1]]);
    }

    // Validar que tenemos un polígono válido
    if (uniquePoints.length < 4) { // Mínimo 3 puntos + punto de cierre
        showNotification('Error', 'La geocerca no es válida', 'error');
        return;
    }

    console.log("✅ Guardando geocerca con puntos:", uniquePoints.length);
    saveGeofenceDirectly(uniquePoints);
}

function calculatePolygonArea(points) {
    if (points.length < 3) return 0;

    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i][0] * points[j][1];
        area -= points[j][0] * points[i][1];
    }

    return Math.abs(area) / 2;
}

function cancelGeofence() {
    console.log("Cancelando geocerca...");

    isDrawingGeofence = false;

    // Remover listener de teclado (NUEVO)
    document.removeEventListener('keydown', handleGeofenceKeydown);

    const drawingControls = document.getElementById('drawing-controls');
    if (drawingControls) {
        drawingControls.classList.remove('active');
        drawingControls.style.display = 'none';
    }

    if (map) {
        map.getCanvas().style.cursor = '';
        map.off('click', handleGeofenceClick);
    }

    if (map && map.getSource('temp-geofence')) {
        map.removeLayer('temp-geofence-fill');
        map.removeLayer('temp-geofence-line');
        map.removeSource('temp-geofence');
    }

    geofenceMarkers.forEach(marker => {
        if (marker && marker.remove) marker.remove();
    });
    geofenceMarkers = [];

    currentGeofencePoints = [];
    updateGeofenceUI();

    console.log("Geocerca cancelada");
}
// ========== FUNCIONES DE DIBUJO Y GESTIÓN DE GEOCERCAS ==========

function drawGeofence(geofence) {
    const sourceId = `geofence-${geofence.id}`;
    const layerFillId = `geofence-fill-${geofence.id}`;
    const layerLineId = `geofence-line-${geofence.id}`;

    // Eliminar si ya existe
    if (map.getSource(sourceId)) {
        map.removeLayer(layerFillId);
        map.removeLayer(layerLineId);
        map.removeSource(sourceId);
    }

    let coordinates = [];

    if (geofence.type === 'circular' && geofence.center) {
        // Crear círculo aproximado (simplificado)
        coordinates = createCircleCoordinates(geofence.center, geofence.radius || 200);
    } else {
        // Polígono normal
        coordinates = [...geofence.points];
        if (coordinates.length > 0 && geofence.type === 'polygon') {
            coordinates.push(coordinates[0]); // Cerrar el polígono
        }
    }

    // Solo dibujar si hay coordenadas válidas
    if (coordinates.length >= 3) {
        map.addSource(sourceId, {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {
                    'name': geofence.name,
                    'id': geofence.id,
                    'type': geofence.type,
                    'pointCount': geofence.pointCount || coordinates.length
                },
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [coordinates]
                }
            }
        });

        // Capa de relleno
        map.addLayer({
            'id': layerFillId,
            'type': 'fill',
            'source': sourceId,
            'paint': {
                'fill-color': geofence.color,
                'fill-opacity': 0.2
            }
        });

        // Capa de línea
        map.addLayer({
            'id': layerLineId,
            'type': 'line',
            'source': sourceId,
            'paint': {
                'line-color': geofence.color,
                'line-width': 3,
                'line-opacity': 0.8
            }
        });

        // Añadir interactividad (código existente...)
        addGeofenceInteractivity(geofence, layerFillId, layerLineId);
    }
}

// Función auxiliar para crear coordenadas de círculo
function createCircleCoordinates(center, radius) {
    const coordinates = [];
    const steps = 32;

    for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const lat = center.latitude + (radius / 111320) * Math.cos(angle);
        const lng = center.longitude + (radius / (111320 * Math.cos(center.latitude * Math.PI / 180))) * Math.sin(angle);
        coordinates.push([lng, lat]);
    }

    return coordinates;
}

function deleteGeofence(geofenceId) {
    const geofenceIndex = geofences.findIndex(g => g.id === geofenceId);
    if (geofenceIndex === -1) return;

    // Eliminar del mapa
    const sourceId = `geofence-${geofenceId}`;
    const layerFillId = `geofence-fill-${geofenceId}`;
    const layerLineId = `geofence-line-${geofenceId}`;

    if (map.getSource(sourceId)) {
        map.removeLayer(layerFillId);
        map.removeLayer(layerLineId);
        map.removeSource(sourceId);
    }

    // Eliminar del array
    const deletedGeofence = geofences.splice(geofenceIndex, 1)[0];

    // Eliminar de Firebase
    deleteGeofenceFromFirebase(geofenceId);

    // Guardar cambios localmente
    saveGeofencesToStorage();

    addDebugLog(`Geocerca "${deletedGeofence.name}" eliminada`, 'info');
    showNotification('Geocerca eliminada', `"${deletedGeofence.name}" ha sido eliminada`, 'info');
}

function saveGeofencesToStorage() {
    try {
        localStorage.setItem('geofences', JSON.stringify(geofences));
        addDebugLog(`Geocercas guardadas: ${geofences.length}`, 'success');
    } catch (error) {
        console.error('Error guardando geocercas:', error);
        addDebugLog('Error guardando geocercas en almacenamiento', 'error');
    }
}

function loadGeofencesFromStorage() {
    try {
        const saved = localStorage.getItem('geofences');
        if (saved) {
            geofences = JSON.parse(saved);
            geofences.forEach(geofence => {
                if (!geofence.pointCount) {
                    geofence.pointCount = geofence.points.length;
                }
                if (!geofence.createdAt) {
                    geofence.createdAt = new Date().toISOString();
                }
                drawGeofence(geofence);
            });
            addDebugLog(`Cargadas ${geofences.length} geocercas desde almacenamiento`, 'info');
        }
    } catch (error) {
        console.error('Error cargando geocercas:', error);
        addDebugLog('Error cargando geocercas desde almacenamiento', 'error');
        geofences = [];
    }
}

function clearGeofences() {
    if (geofences.length === 0) {
        showNotification('Info', 'No hay geocercas para eliminar', 'info');
        return;
    }

    if (!confirm('¿Estás seguro de que quieres eliminar todas las geocercas?')) {
        return;
    }

    geofences.forEach(geofence => {
        const sourceId = `geofence-${geofence.id}`;
        const layerFillId = `geofence-fill-${geofence.id}`;
        const layerLineId = `geofence-line-${geofence.id}`;

        if (map.getSource(sourceId)) {
            map.removeLayer(layerFillId);
            map.removeLayer(layerLineId);
            map.removeSource(sourceId);
        }
    });

    geofences = [];
    saveGeofencesToStorage();

    addDebugLog('Todas las geocercas eliminadas', 'info');
    showNotification('Geocercas eliminadas', 'Todas las geocercas han sido eliminadas', 'info');
}

function getRandomColor() {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ========== FUNCIONES DEL MAPA ==========

function initializeMap(lng, lat) {
    addDebugLog('Inicializando mapa...', 'info');

    try {
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [lng || -68.119, lat || -16.503],
            zoom: 10
        });

        map.on('load', () => {
            addDebugLog('✅ Mapa cargado correctamente', 'success');
            // Iniciar el listener de Firestore después de que el mapa esté listo
            setTimeout(() => {
                initializeFirestoreListener();
            }, 1000);
        });

        map.on('error', (e) => {
            console.error('❌ Error del mapa:', e.error);
            addDebugLog(`Error del mapa: ${e.error}`, 'error');
            showNotification('Error de mapa', 'No se pudo cargar el mapa', 'error');
        });

        // Añadir controles básicos del mapa
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    } catch (error) {
        console.error('❌ Error crítico al inicializar mapa:', error);
        addDebugLog(`Error crítico en mapa: ${error.message}`, 'error');
        showNotification('Error crítico', 'No se pudo inicializar el mapa', 'error');
    }
}
function checkMapState() {
    if (!map) {
        console.error("❌ El mapa no está inicializado");
        showNotification('Error', 'El mapa no está disponible', 'error');
        return false;
    }

    if (!map.loaded()) {
        console.warn("⚠️ El mapa aún no ha terminado de cargar");
        return false;
    }

    return true;
}
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

    if (isRecordingRoute) {
        addPointToCurrentRoute(latitude, longitude);
    }

    updateMap(latitude, longitude, data);
    updateUserInfo(data);
    checkGeofences(latitude, longitude);
}

function checkGeofences(lat, lng) {
    const point = [lng, lat];

    geofences.forEach(geofence => {
        if (isPointInPolygon(point, geofence.points)) {
            const geofenceKey = `entered-${geofence.id}`;
            if (!sessionStorage.getItem(geofenceKey)) {
                addDebugLog(`Usuario entró en geocerca "${geofence.name}"`, 'warning');
                showNotification(
                    'Entrada en geocerca',
                    `Has entrado en la zona: "${geofence.name}"`,
                    'warning'
                );
                sessionStorage.setItem(geofenceKey, 'true');
            }
        } else {
            const geofenceKey = `entered-${geofence.id}`;
            sessionStorage.removeItem(geofenceKey);
        }
    });
}

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

// ========== FUNCIONES DE USUARIO ==========
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

// ========== FUNCIONES DE RUTAS ==========
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
function addGeofenceInteractivity(geofence, layerFillId, layerLineId) {
    // Cambiar cursor al pasar sobre la geocerca
    map.on('mouseenter', layerFillId, () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', layerFillId, () => {
        map.getCanvas().style.cursor = '';
    });

    // Mostrar información al hacer clic
    map.on('click', layerFillId, (e) => {
        const coordinates = e.lngLat;
        const description = `
            <strong>${geofence.name}</strong><br>
            Tipo: ${geofence.type}<br>
            Puntos: ${geofence.pointCount}<br>
            Creada: ${new Date(geofence.createdAt).toLocaleDateString()}
        `;

        new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(description)
            .addTo(map);
    });
}
function addPointToCurrentRoute(lat, lng) {
    if (!isRecordingRoute) return;

    const point = {
        lat: lat,
        lng: lng,
        timestamp: new Date()
    };

    if (currentRoute.points.length > 0) {
        const lastPoint = currentRoute.points[currentRoute.points.length - 1];
        const distance = calculateDistance(lastPoint.lat, lastPoint.lng, lat, lng);
        currentRoute.distance += distance;
    }

    currentRoute.points.push(point);

    // Actualizar la línea en el mapa (NUEVO)
    updateCurrentRouteLine();

    addDebugLog(`Punto añadido a ruta: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'info');
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ========== FUNCIONES DE HISTORIAL ==========
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

// ========== FUNCIONES DE COMPARTIR ==========
function generateShareUrl() {
    if (!currentUserId) {
        currentUserId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('trackerUserId', currentUserId);
    }

    const baseUrl = window.location.href.split('?')[0];
    shareUrl = `${baseUrl}?track=${currentUserId}`;

    const shareUrlInput = document.getElementById('share-url');
    if (shareUrlInput) {
        shareUrlInput.value = 'https://github.com/tu-usuario/hereaca-tracker';
    }

    updateShareMessage();
    return shareUrl;
}

function updateShareMessage() {
    const shareMessage = document.getElementById('share-message');
    if (shareMessage) {
        const githubUrl = 'https://github.com/tu-usuario/hereaca-tracker';
        const currentLocation = marker ? marker.getLngLat() : { lat: 0, lng: 0 };

        shareMessage.value = `¡Hola! Estoy compartiendo mi ubicación en tiempo real.

Coordenadas: ${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}

Proyecto open-source: ${githubUrl}

¡Puedes ver el código y contribuir al proyecto!`;
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Enlace copiado', 'El enlace se ha copiado al portapapeles', 'success');
    }).catch(err => {
        console.error('Error al copiar: ', err);
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Enlace copiado', 'El enlace se ha copiado al portapapeles', 'success');
    });
}

// ========== MANEJO DE EVENTOS ==========
function setupEventListeners() {
    // Menú hamburguesa
    setupSidebarListeners();

    // Botones de geocercas con verificación de auth
    document.getElementById('btn-add-geofence').addEventListener('click', startDrawingGeofence);
    document.getElementById('btn-finish-geofence').addEventListener('click', function() {
        if (currentGeofencePoints.length >= GEOFFENCE_CONFIG.MIN_POINTS) {
            finishGeofenceWithConfirmation();
        } else {
            showNotification(
                'Puntos insuficientes',
                `Necesitas al menos ${GEOFFENCE_CONFIG.MIN_POINTS} puntos. Tienes: ${currentGeofencePoints.length}`,
                'warning'
            );
        }
    });
    document.getElementById('btn-cancel-geofence').addEventListener('click', cancelGeofenceWithConfirmation);
    document.getElementById('btn-clear-geofences').addEventListener('click', clearGeofences);

    // Rutas con verificación de auth
    document.getElementById('btn-start-recording').addEventListener('click', startRecordingRoute);
    document.getElementById('btn-stop-recording').addEventListener('click', stopRecordingRoute);

    // Modos
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

    // Botón de gestión de rutas (NUEVO)
    const btnManageRoutes = document.createElement('button');
    btnManageRoutes.id = 'btn-manage-routes';
    btnManageRoutes.className = 'btn btn-info';
    btnManageRoutes.innerHTML = `
        <i class="fas fa-route"></i>
        <div>
            <div>Gestionar Rutas</div>
            <small>Ver y exportar</small>
        </div>
    `;
    btnManageRoutes.addEventListener('click', showRouteManager);

    // Botón de auth (NUEVO)
    const authButton = document.createElement('button');
    authButton.id = 'btn-auth';
    authButton.className = 'btn ' + (isUserLoggedIn ? 'btn-warning' : 'btn-secondary');
    authButton.innerHTML = `
        <i class="fas ${isUserLoggedIn ? 'fa-sign-out-alt' : 'fa-sign-in-alt'}"></i>
        <div>
            <div>${isUserLoggedIn ? 'Cerrar Sesión' : 'Iniciar Sesión'}</div>
            <small>${isUserLoggedIn ? 'Salir' : 'Acceder'}</small>
        </div>
    `;
    authButton.addEventListener('click', function() {
        if (isUserLoggedIn) {
            logout();
        } else {
            showLoginModal('acceder a todas las funciones');
        }
    });

    const controls = document.querySelector('.map-controls');
    if (controls) {
        controls.appendChild(btnManageRoutes);
        controls.appendChild(authButton);
    }

    // Cerrar sidebar cuando se hace clic en botones importantes
    const sidebarButtons = document.querySelectorAll('#sidebar .btn');
    sidebarButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
}
function setActiveButton(activeId) {
    document.querySelectorAll('.btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(activeId).classList.add('active');
}

// ========== INICIALIZACIÓN PRINCIPAL ==========
async function initializeApp() {
    addDebugLog('Iniciando aplicación de rastreo avanzado...', 'info');
    updateStatus('Iniciando...', false);

    try {
        // Verificar estado de autenticación primero
        await checkAuthState();

        // Inicializar componentes básicos
        generateShareUrl();
        loadRoutesFromStorage();
        loadSavedPlaces();

        // Inicializar mapa (esto debe hacerse independientemente del auth)
        initializeMap();

        // Configurar event listeners
        setupEventListeners();

        // Inicializar auth y geocercas después del mapa
        await initializeAuth();

        addSyncButton();
        addDebugButton();
        setupAdvancedDrag();

        // Asegurarse de que el sidebar esté cerrado al iniciar
        setTimeout(closeSidebar, 100);

        setTimeout(updateShareMessage, 1000);
        setTimeout(() => {
            debugFirebaseState();
            verifyAuthConfig();
        }, 3000);

        addDebugLog('✅ Aplicación completamente inicializada', 'success');

    } catch (error) {
        console.error('❌ Error en inicialización:', error);
        showNotification('Error', 'Hubo un problema al iniciar la aplicación', 'error');

        // Intentar recuperación
        setTimeout(() => {
            if (!map) {
                console.log("🔄 Reintentando inicialización del mapa...");
                initializeMap();
            }
        }, 2000);
    }
}
function verifyDependencies() {
    console.log("=== VERIFICACIÓN DE DEPENDENCIAS ===");

    // Verificar Firebase
    if (typeof firebase === 'undefined') {
        console.error("❌ Firebase no está cargado");
        return false;
    }

    // Verificar Mapbox
    if (typeof mapboxgl === 'undefined') {
        console.error("❌ Mapbox GL no está cargado");
        return false;
    }

    // Verificar token de Mapbox
    if (!mapboxgl.accessToken) {
        console.error("❌ Token de Mapbox no configurado");
        return false;
    }

    console.log("✅ Todas las dependencias cargadas correctamente");
    return true;
}

// Ejecutar al inicio
document.addEventListener('DOMContentLoaded', function() {
    if (verifyDependencies()) {
        initializeApp();
    } else {
        showNotification('Error', 'Faltan dependencias necesarias', 'error');
    }
});
function recoverFromAuthError() {
    console.log("🔄 Intentando recuperar de error de autenticación...");

    // Verificar si el mapa existe
    if (!map) {
        console.log("🔁 Reinicializando mapa...");
        initializeMap();
    }

    // Verificar estado de autenticación
    checkAuthState().then(() => {
        console.log("✅ Estado de autenticación verificado");
    });
}
 function debugAuth() {
     const user = auth.currentUser;
     console.log("=== DEBUG AUTH ===");
     console.log("Usuario actual:", user);
     console.log("Proveedores:", user ? user.providerData : 'N/A');
     console.log("Token:", user ? user.getIdToken() : 'N/A');

     if (!user) {
         console.log("❌ No hay usuario autenticado");
     } else {
         console.log("✅ Usuario autenticado:", {
             uid: user.uid,
             email: user.email,
             displayName: user.displayName,
             photoURL: user.photoURL,
             isAnonymous: user.isAnonymous
         });
     }
 }
 function verifyAuthConfig() {
     console.log("=== VERIFICACIÓN CONFIGURACIÓN AUTH ===");

     // Verificar dominio actual
     console.log("📍 Dominio actual:", window.location.hostname);

     // Verificar si Google está configurado
     const googleProvider = new firebase.auth.GoogleAuthProvider();
     console.log("🔐 Proveedor Google:", googleProvider);

     // Verificar configuración de Firebase
     console.log("🔥 Config Firebase:", {
         projectId: firebaseConfig.projectId,
         authDomain: firebaseConfig.authDomain
     });

     // Verificar si estamos en dominio autorizado
     const authorizedDomains = ['localhost', 'hereaca.firebaseapp.com', 'hereaca.web.app'];
     const currentDomain = window.location.hostname;
     const isAuthorized = authorizedDomains.some(domain => currentDomain.includes(domain));

     console.log("✅ Dominio autorizado:", isAuthorized);

     if (!isAuthorized) {
         console.warn("⚠️  El dominio actual no está en la lista de autorizados");
         console.warn("Dominio actual:", currentDomain);
         console.warn("Dominios autorizados:", authorizedDomains);
     }
 }

 // Ejecutar al iniciar
 setTimeout(verifyAuthConfig, 1000);
// Verificación temporal - solo para desarrollo
function checkAndAddDomain() {
    const currentDomain = window.location.hostname;
    const authorizedDomains = ['localhost', 'hereaca.firebaseapp.com', 'hereaca.web.app'];

    if (!authorizedDomains.includes(currentDomain) && currentDomain !== '127.0.0.1') {
        console.warn(`⚠️  Agrega este dominio a Firebase Console: ${currentDomain}`);
        showNotification(
            'Configuración requerida',
            `Agrega "${currentDomain}" a dominios autorizados en Firebase Console`,
            'warning'
        );
    }
}
// ========== FUNCIONES FALTANTES ==========
// REEMPLAZAR la función startRecordingRoute existente:
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

    document.getElementById('btn-start-recording').classList.add('active');
    document.getElementById('btn-stop-recording').classList.remove('disabled');

    // Iniciar el dibujo de la ruta con líneas segmentadas (NUEVO)
    startRouteDrawing();
}

// AGREGAR esta nueva función:
function startRouteDrawing() {
    if (map.getSource('current-route')) {
        map.removeLayer('current-route-line');
        map.removeSource('current-route');
    }

    map.addSource('current-route', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': []
            }
        }
    });

    map.addLayer({
        'id': 'current-route-line',
        'type': 'line',
        'source': 'current-route',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#FF6B6B',
            'line-width': 4,
            'line-opacity': 0.8,
            'line-dasharray': [2, 2] // Líneas segmentadas (NUEVO)
        }
    });
}

// AGREGAR esta nueva función:
function updateCurrentRouteLine() {
    if (!map.getSource('current-route')) return;

    const coordinates = currentRoute.points.map(point => [point.lng, point.lat]);

    map.getSource('current-route').setData({
        'type': 'Feature',
        'properties': {},
        'geometry': {
            'type': 'LineString',
            'coordinates': coordinates
        }
    });
}

function stopRecordingRoute() {
    if (!isRecordingRoute) {
        showNotification('No hay grabación', 'No hay ninguna ruta en grabación', 'warning');
        return;
    }

    isRecordingRoute = false;
    currentRoute.endTime = new Date();
    recordedRoutes.push({...currentRoute});
    saveRoutesToStorage();

    // Limpiar la ruta actual del mapa (NUEVO)
    if (map.getSource('current-route')) {
        map.removeLayer('current-route-line');
        map.removeSource('current-route');
    }

    addDebugLog(`Ruta guardada: ${currentRoute.points.length} puntos, ${currentRoute.distance.toFixed(2)} km`, 'success');
    showNotification(
        'Ruta guardada',
        `Se ha guardado tu ruta con ${currentRoute.points.length} puntos (${currentRoute.distance.toFixed(2)} km)`,
        'success'
    );

    document.getElementById('btn-start-recording').classList.remove('active');
    document.getElementById('btn-stop-recording').classList.add('disabled');
}
// ========== GESTIÓN DE RUTAS COMPLETAS ==========
function showRouteManager() {


    const modal = document.createElement('div');
    modal.className = 'routes-modal';
    modal.innerHTML = `
        <div class="routes-modal-content">
            <div class="routes-modal-header">
                <h3>Gestión de Rutas Guardadas</h3>
                <button class="routes-modal-close">&times;</button>
            </div>
            <div class="routes-modal-body">
                <div class="routes-list" id="routes-list">
                    ${generateRoutesList()}
                </div>
                <div class="routes-actions">
                    <button id="btn-export-routes" class="btn btn-info">
                        <i class="fas fa-download"></i> Exportar Rutas
                    </button>
                    <button id="btn-clear-all-routes" class="btn btn-danger">
                        <i class="fas fa-trash"></i> Eliminar Todas
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    modal.querySelector('.routes-modal-close').addEventListener('click', () => {
        modal.remove();
    });

    modal.querySelector('#btn-export-routes').addEventListener('click', exportRoutes);
    modal.querySelector('#btn-clear-all-routes').addEventListener('click', clearAllRoutes);

    // Cerrar modal al hacer clic fuera
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function generateRoutesList() {
    if (recordedRoutes.length === 0) {
        return '<div class="no-routes">No hay rutas guardadas</div>';
    }

    return recordedRoutes.map(route => `
        <div class="route-item" data-route-id="${route.id}">
            <div class="route-info">
                <div class="route-name">${route.name}</div>
                <div class="route-details">
                    <span>${route.points.length} puntos</span>
                    <span>${route.distance.toFixed(2)} km</span>
                    <span>${new Date(route.startTime).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="route-actions">
                <button class="btn btn-sm btn-success view-route" data-route-id="${route.id}">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-danger delete-route" data-route-id="${route.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}
// ========== SISTEMA DE ARRASTRE AVANZADO ==========
function setupAdvancedDrag() {
    if (!map) return;

    // Configurar interacción mejorada para marcadores
    map.on('mouseenter', 'geofence-points', () => {
        map.getCanvas().style.cursor = 'move';
    });

    map.on('mouseleave', 'geofence-points', () => {
        map.getCanvas().style.cursor = '';
    });

    addDebugLog('Sistema de arrastre avanzado configurado', 'success');
}
function exportRoutes() {
    const routesData = {
        exportedAt: new Date().toISOString(),
        totalRoutes: recordedRoutes.length,
        routes: recordedRoutes
    };

    const dataStr = JSON.stringify(routesData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `rutas_${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    showNotification('Rutas exportadas', 'Todas las rutas se han exportado correctamente', 'success');
}

function clearAllRoutes() {
    if (recordedRoutes.length === 0) {
        showNotification('No hay rutas', 'No hay rutas para eliminar', 'info');
        return;
    }

    if (!confirm('¿Estás seguro de que quieres eliminar TODAS las rutas guardadas?')) {
        return;
    }

    recordedRoutes = [];
    saveRoutesToStorage();

    // Actualizar la lista en el modal si está abierto
    const routesList = document.getElementById('routes-list');
    if (routesList) {
        routesList.innerHTML = '<div class="no-routes">No hay rutas guardadas</div>';
    }

    showNotification('Rutas eliminadas', 'Todas las rutas han sido eliminadas', 'info');
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

function drawRouteOnMap(route) {
    // Implementación básica - puedes expandir esto
    console.log("Dibujando ruta en el mapa:", route);
}

function loadSavedPlaces() {
    // Implementación básica para lugares guardados
    const saved = localStorage.getItem('savedPlaces');
    if (saved) {
        // Cargar lugares guardados
    }
}

// ========== INICIAR APLICACIÓN ==========
document.addEventListener('DOMContentLoaded', initializeApp);
// ========== FUNCIONES DEL MENÚ HAMBURGUESA ==========

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const menuToggle = document.getElementById('menu-toggle');

    if (sidebar && mainContent && menuToggle) {
        sidebar.classList.toggle('active');
        mainContent.classList.toggle('sidebar-active');
        menuToggle.classList.toggle('active');

        // Actualizar el icono del botón
        const icon = menuToggle.querySelector('i');
        if (sidebar.classList.contains('active')) {
            icon.className = 'fas fa-times';
            addDebugLog('Sidebar abierto', 'info');
        } else {
            icon.className = 'fas fa-bars';
            addDebugLog('Sidebar cerrado', 'info');
        }
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const menuToggle = document.getElementById('menu-toggle');

    if (sidebar && mainContent && menuToggle) {
        sidebar.classList.remove('active');
        mainContent.classList.remove('sidebar-active');
        menuToggle.classList.remove('active');

        // Restaurar icono de hamburguesa
        const icon = menuToggle.querySelector('i');
        icon.className = 'fas fa-bars';
    }
}

function setupSidebarListeners() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');

    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
        addDebugLog('Listener del menú hamburguesa configurado', 'success');
    } else {
        addDebugLog('No se encontró el botón del menú hamburguesa', 'error');
    }

    // Cerrar sidebar al hacer clic fuera de él en dispositivos móviles
    if (mainContent) {
        mainContent.addEventListener('click', function(e) {
            if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
                if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                    closeSidebar();
                }
            }
        });
    }

    // Cerrar sidebar al redimensionar la ventana a desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            closeSidebar();
        }
    });
}
const additionalStyles = `
/* Modal de autenticación */
.auth-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
}

.auth-modal-content {
    background: white;
    border-radius: 10px;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.auth-modal-header {
    padding: 20px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.auth-modal-header h3 {
    margin: 0;
    color: #333;
}

.auth-modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
}

.auth-modal-body {
    padding: 20px;
}

.auth-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 20px 0;
}

.auth-terms {
    text-align: center;
    color: #666;
    margin-top: 15px;
}

/* Modal de confirmación */
.confirmation-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
}

.confirmation-modal-content {
    background: white;
    border-radius: 10px;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.confirmation-modal-header {
    padding: 20px;
    border-bottom: 1px solid #eee;
}

.confirmation-modal-header h3 {
    margin: 0;
    color: #333;
}

.confirmation-modal-body {
    padding: 20px;
}

.confirmation-buttons {
    display: flex;
    gap: 10px;
    margin-top: 20px;
    justify-content: flex-end;
}

/* Gestión de rutas */
.routes-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
}

.routes-modal-content {
    background: white;
    border-radius: 10px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.routes-modal-header {
    padding: 20px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.routes-modal-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
}

.routes-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 20px;
}

.route-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    border: 1px solid #eee;
    border-radius: 5px;
    margin-bottom: 10px;
}

.route-info {
    flex: 1;
}

.route-name {
    font-weight: bold;
    margin-bottom: 5px;
}

.route-details {
    display: flex;
    gap: 15px;
    font-size: 12px;
    color: #666;
}

.route-actions {
    display: flex;
    gap: 5px;
}

.no-routes {
    text-align: center;
    color: #666;
    padding: 40px;
    font-style: italic;
}

.routes-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    border-top: 1px solid #eee;
    padding-top: 20px;
}
`;
// Agregar estilos al documento
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);