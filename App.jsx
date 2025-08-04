import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';

// --- Configuración de Firebase y Autenticación ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Error al inicializar Firebase:", e);
}

// Componente principal de la aplicación
const App = () => {
    // --- Estados de la aplicación ---
    const [tickets, setTickets] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);
    const [view, setView] = useState('dashboard'); // 'dashboard', 'tickets', 'inventory', 'history'
    const [showTicketModal, setShowTicketModal] = useState(false);
    const [showInventoryModal, setShowInventoryModal] = useState(false);
    const [formData, setFormData] = useState({
        cliente: '',
        dispositivo: '',
        problema: '',
        repuestoId: '',
        estado: 'Pendiente',
        fechaCreacion: new Date().toISOString(),
        costoRepuesto: 0,
        precioReparacion: 0
    });
    const [inventoryFormData, setInventoryFormData] = useState({
        nombre: '',
        stock: 0,
        costo: 0
    });
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [clientHistory, setClientHistory] = useState([]);

    // --- Efecto para la autenticación y carga de datos ---
    useEffect(() => {
        if (!auth || !db) return;
        const handleAuth = async () => {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Error de autenticación:", error);
            }
        };
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
            } else {
                setUserId(null);
                setIsAuthReady(true);
            }
        });
        handleAuth();
        return () => unsubscribeAuth();
    }, []);

    // --- Efecto para escuchar tickets en Firestore ---
    useEffect(() => {
        if (!isAuthReady || !userId || !db) return;
        const ticketsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/tickets`);
        const unsubscribeSnapshot = onSnapshot(ticketsCollectionRef, (snapshot) => {
            const newTickets = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTickets(newTickets);
        }, (error) => {
            console.error("Error al escuchar los tickets:", error);
        });
        return () => unsubscribeSnapshot();
    }, [isAuthReady, userId]);

    // --- Efecto para escuchar inventario en Firestore ---
    useEffect(() => {
        if (!isAuthReady || !userId || !db) return;
        const inventoryCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
        const unsubscribeSnapshot = onSnapshot(inventoryCollectionRef, (snapshot) => {
            const newInventory = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setInventory(newInventory);
        }, (error) => {
            console.error("Error al escuchar el inventario:", error);
        });
        return () => unsubscribeSnapshot();
    }, [isAuthReady, userId]);

    // --- Manejadores de Eventos y Lógica ---

    const handleTicketInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: name === 'costoRepuesto' || name === 'precioReparacion' ? Number(value) : value 
        }));
    };

    const handleInventoryInputChange = (e) => {
        const { name, value } = e.target;
        setInventoryFormData(prev => ({ ...prev, [name]: name === 'stock' || name === 'costo' ? Number(value) : value }));
    };

    // Función para añadir/actualizar tickets
    const handleAddTicket = async (e) => {
        e.preventDefault();
        if (!userId || !db) return;

        try {
            // Si se seleccionó un repuesto, actualizar su stock y costo
            let repuestoCosto = 0;
            if (formData.repuestoId) {
                const repuestoDocRef = doc(db, `artifacts/${appId}/users/${userId}/inventory`, formData.repuestoId);
                const currentRepuesto = inventory.find(item => item.id === formData.repuestoId);
                if (currentRepuesto && currentRepuesto.stock > 0) {
                    await updateDoc(repuestoDocRef, { stock: currentRepuesto.stock - 1 });
                    repuestoCosto = currentRepuesto.costo;
                } else {
                    console.error("Error: Repuesto sin stock.");
                    return;
                }
            }

            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/tickets`), {
                ...formData,
                costoRepuesto: repuestoCosto
            });
            setFormData({
                cliente: '',
                dispositivo: '',
                problema: '',
                repuestoId: '',
                estado: 'Pendiente',
                fechaCreacion: new Date().toISOString(),
                costoRepuesto: 0,
                precioReparacion: 0
            });
            setShowTicketModal(false);
        } catch (error) {
            console.error("Error al añadir el ticket:", error);
        }
    };

    // Función para añadir/actualizar inventario
    const handleAddInventoryItem = async (e) => {
        e.preventDefault();
        if (!userId || !db) return;

        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${userId}/inventory`), inventoryFormData);
            setInventoryFormData({ nombre: '', stock: 0, costo: 0 });
            setShowInventoryModal(false);
        } catch (error) {
            console.error("Error al añadir el inventario:", error);
        }
    };
    
    // Funciones de gestión de tickets
    const handleUpdateStatus = async (ticketId, newStatus) => {
        if (!userId || !db) return;
        try {
            const ticketDocRef = doc(db, `artifacts/${appId}/users/${userId}/tickets`, ticketId);
            await updateDoc(ticketDocRef, { estado: newStatus });
        } catch (error) {
            console.error("Error al actualizar el estado del ticket:", error);
        }
    };

    const handleDeleteTicket = async (ticketId) => {
        if (!userId || !db) return;
        try {
            const ticketDocRef = doc(db, `artifacts/${appId}/users/${userId}/tickets`, ticketId);
            await deleteDoc(ticketDocRef);
        } catch (error) {
            console.error("Error al eliminar el ticket:", error);
        }
    };
    
    // Función para generar un enlace de WhatsApp
    const handleWhatsAppNotification = (ticket) => {
        const repuesto = inventory.find(item => item.id === ticket.repuestoId);
        const repuestoNombre = repuesto ? ` (Repuesto: ${repuesto.nombre})` : '';
        const message = `Hola ${ticket.cliente}, tu dispositivo ${ticket.dispositivo} tiene el siguiente estado: ${ticket.estado}.${repuestoNombre} ID de ticket: ${ticket.id}`;
        // Reemplaza '549...' con el número de teléfono del cliente si lo tuvieras.
        const phoneNumber = '5491122334455'; 
        const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    // Funciones de gestión de inventario
    const handleDeleteInventoryItem = async (itemId) => {
        if (!userId || !db) return;
        try {
            const itemDocRef = doc(db, `artifacts/${appId}/users/${userId}/inventory`, itemId);
            await deleteDoc(itemDocRef);
        } catch (error) {
            console.error("Error al eliminar el artículo de inventario:", error);
        }
    };

    // Función para buscar historial de cliente
    const handleSearchHistory = async () => {
        if (!userId || !db || !historySearchTerm) return;
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/tickets`), where("cliente", "==", historySearchTerm));
        try {
            const querySnapshot = await getDocs(q);
            const historyTickets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setClientHistory(historyTickets);
        } catch (error) {
            console.error("Error al buscar el historial del cliente:", error);
        }
    };

    // Cálculo de estadísticas para el dashboard
    const totalTickets = tickets.length;
    const pendingTickets = tickets.filter(t => t.estado === 'Pendiente').length;
    const progressTickets = tickets.filter(t => t.estado === 'En Progreso').length;
    const finishedTickets = tickets.filter(t => t.estado === 'Listo' || t.estado === 'Entregado').length;
    const totalRepuestosCost = tickets.reduce((acc, ticket) => acc + (ticket.costoRepuesto || 0), 0);
    const totalIngresos = tickets.reduce((acc, ticket) => acc + (ticket.precioReparacion || 0), 0);

    const statusColors = {
        'Pendiente': 'bg-red-500',
        'En Progreso': 'bg-yellow-500',
        'Listo': 'bg-green-500',
        'Entregado': 'bg-gray-500',
    };
    
    // Renderizado condicional de las vistas
    const renderContent = () => {
        switch (view) {
            case 'dashboard':
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-6">Resumen del Negocio</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-blue-100 p-6 rounded-xl shadow-md">
                                <h3 className="text-lg font-semibold text-blue-800">Total de Tickets</h3>
                                <p className="text-4xl font-bold text-blue-600 mt-2">{totalTickets}</p>
                            </div>
                            <div className="bg-yellow-100 p-6 rounded-xl shadow-md">
                                <h3 className="text-lg font-semibold text-yellow-800">En Progreso</h3>
                                <p className="text-4xl font-bold text-yellow-600 mt-2">{progressTickets}</p>
                            </div>
                            <div className="bg-green-100 p-6 rounded-xl shadow-md">
                                <h3 className="text-lg font-semibold text-green-800">Terminados</h3>
                                <p className="text-4xl font-bold text-green-600 mt-2">{finishedTickets}</p>
                            </div>
                            <div className="bg-purple-100 p-6 rounded-xl shadow-md">
                                <h3 className="text-lg font-semibold text-purple-800">Ingresos Totales</h3>
                                <p className="text-4xl font-bold text-purple-600 mt-2">${totalIngresos.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                );
            case 'tickets':
                return (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">Tickets de Reparación</h2>
                            <button onClick={() => setShowTicketModal(true)} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-200">
                                Añadir Nuevo Ticket
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full bg-white rounded-lg shadow-md">
                                <thead className="bg-gray-200">
                                    <tr>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Cliente</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Dispositivo</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Problema</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Repuesto</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Precio</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Estado</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tickets.map(ticket => (
                                        <tr key={ticket.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-150">
                                            <td className="py-4 px-6">{ticket.cliente}</td>
                                            <td className="py-4 px-6">{ticket.dispositivo}</td>
                                            <td className="py-4 px-6">{ticket.problema}</td>
                                            <td className="py-4 px-6">
                                                {inventory.find(item => item.id === ticket.repuestoId)?.nombre || 'N/A'}
                                            </td>
                                            <td className="py-4 px-6">${ticket.precioReparacion || 0}</td>
                                            <td className="py-4 px-6">
                                                <span className={`px-3 py-1 text-sm font-bold text-white rounded-full ${statusColors[ticket.estado]}`}>
                                                    {ticket.estado}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 flex items-center space-x-2">
                                                <select 
                                                    value={ticket.estado}
                                                    onChange={(e) => handleUpdateStatus(ticket.id, e.target.value)}
                                                    className="px-2 py-1 rounded-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
                                                >
                                                    <option value="Pendiente">Pendiente</option>
                                                    <option value="En Progreso">En Progreso</option>
                                                    <option value="Listo">Listo</option>
                                                    <option value="Entregado">Entregado</option>
                                                </select>
                                                <button onClick={() => handleWhatsAppNotification(ticket)} className="px-3 py-1 bg-green-500 text-white rounded-md shadow hover:bg-green-600">
                                                    WhatsApp
                                                </button>
                                                <button onClick={() => handleDeleteTicket(ticket.id)} className="px-3 py-1 bg-red-500 text-white rounded-md shadow hover:bg-red-600">
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'inventory':
                return (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">Inventario de Repuestos</h2>
                            <button onClick={() => setShowInventoryModal(true)} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-200">
                                Añadir Repuesto
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full bg-white rounded-lg shadow-md">
                                <thead className="bg-gray-200">
                                    <tr>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Nombre</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Stock</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Costo</th>
                                        <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inventory.map(item => (
                                        <tr key={item.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-150">
                                            <td className="py-4 px-6">{item.nombre}</td>
                                            <td className="py-4 px-6">
                                                <span className={`px-3 py-1 text-sm font-bold text-white rounded-full ${item.stock < 5 ? 'bg-red-500' : 'bg-green-500'}`}>
                                                    {item.stock}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">${item.costo}</td>
                                            <td className="py-4 px-6">
                                                <button onClick={() => handleDeleteInventoryItem(item.id)} className="px-3 py-1 bg-red-500 text-white rounded-md shadow hover:bg-red-600">
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'history':
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-6">Historial de Clientes</h2>
                        <div className="flex space-x-2 mb-6">
                            <input
                                type="text"
                                placeholder="Buscar por nombre de cliente..."
                                value={historySearchTerm}
                                onChange={(e) => setHistorySearchTerm(e.target.value)}
                                className="flex-1 px-4 py-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <button onClick={handleSearchHistory} className="px-6 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700">
                                Buscar
                            </button>
                        </div>
                        {clientHistory.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full bg-white rounded-lg shadow-md">
                                    <thead className="bg-gray-200">
                                        <tr>
                                            <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Cliente</th>
                                            <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Dispositivo</th>
                                            <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Problema</th>
                                            <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Estado</th>
                                            <th className="py-3 px-6 text-left text-sm font-semibold text-gray-600">Precio</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clientHistory.map(ticket => (
                                            <tr key={ticket.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors duration-150">
                                                <td className="py-4 px-6">{ticket.cliente}</td>
                                                <td className="py-4 px-6">{ticket.dispositivo}</td>
                                                <td className="py-4 px-6">{ticket.problema}</td>
                                                <td className="py-4 px-6">
                                                    <span className={`px-3 py-1 text-sm font-bold text-white rounded-full ${statusColors[ticket.estado]}`}>
                                                        {ticket.estado}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6">${ticket.precioReparacion || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 mt-8">No se encontraron tickets para este cliente o aún no has realizado una búsqueda.</p>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };
    
    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl p-8">
                <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-2">Gestión de Reparaciones Digi</h1>
                <p className="text-center text-gray-500 mb-6">ID de Usuario: {userId || 'Cargando...'}</p>
                
                {/* Navegación */}
                <div className="flex justify-center space-x-2 mb-8">
                    <button onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg font-bold ${view === 'dashboard' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}>Dashboard</button>
                    <button onClick={() => setView('tickets')} className={`px-4 py-2 rounded-lg font-bold ${view === 'tickets' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}>Tickets</button>
                    <button onClick={() => setView('inventory')} className={`px-4 py-2 rounded-lg font-bold ${view === 'inventory' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}>Inventario</button>
                    <button onClick={() => setView('history')} className={`px-4 py-2 rounded-lg font-bold ${view === 'history' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-800'}`}>Historial</button>
                </div>

                {renderContent()}

                {/* Modal para añadir ticket */}
                {showTicketModal && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4">
                        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                            <h3 className="text-2xl font-bold text-gray-800 mb-4">Añadir Nuevo Ticket</h3>
                            <form onSubmit={handleAddTicket} className="space-y-4">
                                <div>
                                    <label htmlFor="cliente" className="block text-sm font-semibold text-gray-700">Cliente</label>
                                    <input type="text" id="cliente" name="cliente" value={formData.cliente} onChange={handleTicketInputChange} required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label htmlFor="dispositivo" className="block text-sm font-semibold text-gray-700">Dispositivo</label>
                                    <input type="text" id="dispositivo" name="dispositivo" value={formData.dispositivo} onChange={handleTicketInputChange} required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label htmlFor="problema" className="block text-sm font-semibold text-gray-700">Problema</label>
                                    <textarea id="problema" name="problema" value={formData.problema} onChange={handleTicketInputChange} required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"></textarea>
                                </div>
                                <div>
                                    <label htmlFor="repuestoId" className="block text-sm font-semibold text-gray-700">Repuesto (Opcional)</label>
                                    <select id="repuestoId" name="repuestoId" value={formData.repuestoId} onChange={handleTicketInputChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                        <option value="">-- Sin repuesto --</option>
                                        {inventory.map(item => (
                                            <option key={item.id} value={item.id} disabled={item.stock <= 0}>
                                                {item.nombre} (Stock: {item.stock})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="precioReparacion" className="block text-sm font-semibold text-gray-700">Precio de Reparación ($)</label>
                                    <input type="number" id="precioReparacion" name="precioReparacion" value={formData.precioReparacion} onChange={handleTicketInputChange} required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                                </div>
                                <div className="flex justify-end space-x-4">
                                    <button type="button" onClick={() => setShowTicketModal(false)} className="px-4 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">
                                        Cancelar
                                    </button>
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">
                                        Guardar Ticket
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                
                {/* Modal para añadir inventario */}
                {showInventoryModal && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4">
                        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
                            <h3 className="text-2xl font-bold text-gray-800 mb-4">Añadir Nuevo Repuesto</h3>
                            <form onSubmit={handleAddInventoryItem} className="space-y-4">
                                <div>
                                    <label htmlFor="nombre" className="block text-sm font-semibold text-gray-700">Nombre</label>
                                    <input type="text" id="nombre" name="nombre" value={inventoryFormData.nombre} onChange={handleInventoryInputChange} required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label htmlFor="stock" className="block text-sm font-semibold text-gray-700">Stock</label>
                                    <input type="number" id="stock" name="stock" value={inventoryFormData.stock} onChange={handleInventoryInputChange} required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label htmlFor="costo" className="block text-sm font-semibold text-gray-700">Costo ($)</label>
                                    <input type="number" id="costo" name="costo" value={inventoryFormData.costo} onChange={handleInventoryInputChange} required
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
                                </div>
                                <div className="flex justify-end space-x-4">
                                    <button type="button" onClick={() => setShowInventoryModal(false)} className="px-4 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">
                                        Cancelar
                                    </button>
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">
                                        Guardar Repuesto
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
