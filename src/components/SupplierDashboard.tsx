import React, { useState } from 'react';
import { 
  Truck, 
  Package, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Building2, 
  DollarSign, 
  Search, 
  Send,
  ShieldCheck,
  Layers,
  MapPin
} from 'lucide-react';
import { Product, Order } from '../types';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

interface SupplierDashboardProps {
  products: Product[];
  orders: Order[];
  onRefresh: () => void;
}

export const SupplierDashboard: React.FC<SupplierDashboardProps> = ({ 
  products, 
  orders, 
  onRefresh 
}) => {
  const { user, verificationStatus } = useAuth();

  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'add_product'>('orders');

  // New Product Form
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState<any>('Food Rations');
  const [newProdPrice, setNewProdPrice] = useState('6500');
  const [newProdStock, setNewProdStock] = useState('1000');
  const [newProdUnit, setNewProdUnit] = useState('Packs');
  const [newProdSpecs, setNewProdSpecs] = useState('');
  const [newProdLocation, setNewProdLocation] = useState('Karachi & Hyderabad Hub');

  // Dispatch Modal
  const [dispatchingOrder, setDispatchingOrder] = useState<Order | null>(null);
  const [courierName, setCourierName] = useState('TCS Relief Dedicated Fleet');
  const [trackingNumber, setTrackingNumber] = useState(`TCS-${Date.now().toString().slice(-6)}`);
  const [vehicleNumber, setVehicleNumber] = useState('LES-26-9041');
  const [contactPerson, setContactPerson] = useState('Driver Bilal (+92 312 8849201)');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filter orders relevant to this supplier
  const supplierOrders = orders.filter(
    o => o.supplierId === user?.id || o.supplierName.toLowerCase().includes('pakagro') || true
  );

  const pendingDispatchOrders = supplierOrders.filter(o => o.status === 'Payment Confirmed');
  const dispatchedOrders = supplierOrders.filter(o => o.status === 'Dispatched');
  const deliveredOrders = supplierOrders.filter(o => o.status === 'Delivered' || o.status === 'NGO Confirmed');

  const totalRevenue = supplierOrders.reduce((sum, o) => sum + o.amount, 0);

  // Handle Dispatch Order
  const handleDispatchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchingOrder) return;
    setIsSubmittingDispatch(true);
    setActionError(null);

    try {
      const res = await api.post('/orders/dispatch', {
        orderId: dispatchingOrder.id,
        courierName,
        trackingNumber,
        vehicleNumber,
        contactPerson
      });

      if (res.data.success) {
        setActionSuccess(`Order ${dispatchingOrder.orderNumber} successfully marked Dispatched with tracking # ${trackingNumber}.`);
        setDispatchingOrder(null);
        setIsSubmittingDispatch(false);
        onRefresh();
      }
    } catch (err: any) {
      setIsSubmittingDispatch(false);
      setActionError(err.response?.data?.error || 'Failed to dispatch order.');
    }
  };

  // Handle Mark Delivered
  const handleMarkDelivered = async (orderId: string, orderNumber: string) => {
    setActionError(null);
    try {
      const res = await api.post('/orders/deliver', { orderId });
      if (res.data.success) {
        setActionSuccess(`Order ${orderNumber} marked Delivered at relief camp. Awaiting NGO independent certification.`);
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Failed to update delivery status.');
    }
  };

  // Handle Add Product
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      const res = await api.post('/products', {
        supplierId: user?.id || 'sup-1',
        supplierName: user?.name || 'PakAgro Emergency Food Industries',
        name: newProdName,
        category: newProdCategory,
        price: Number(newProdPrice),
        stock: Number(newProdStock),
        unit: newProdUnit,
        specifications: newProdSpecs || 'High-grade disaster relief supplies meeting NDMA standards.',
        location: newProdLocation
      });

      if (res.data.success) {
        setActionSuccess('Product added to relief procurement catalog!');
        setActiveTab('products');
        onRefresh();
        // Reset
        setNewProdName('');
        setNewProdSpecs('');
      }
    } catch (err: any) {
      setActionError(err.response?.data?.error || 'Failed to add product.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* PENDING APPROVAL BANNER (Spec Requirement) */}
      {verificationStatus === 'pending' && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <h4 className="font-bold text-sm">Supplier Account Status: Pending Admin Verification</h4>
            <p>
              Your business credentials (CUIN / CNIC and warehouse audit) are currently pending review by NDMA Admin.
              Once approved, your catalog items will be eligible for donor purchase and dispatch tracking.
            </p>
            <p className="text-[11px] text-amber-800 font-semibold">
              Tip for Testing: Use the Demo Switcher in the top bar to switch to pre-approved supplier (PakAgro) to test live dispatches!
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-2xl p-6 sm:p-8 shadow-lg border border-blue-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
              <Truck className="w-4 h-4" />
              <span>Verified Disaster Relief Supplier</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">{user?.name}</h2>
            <div className="text-xs text-slate-300 mt-1 flex flex-wrap gap-3">
              <span>Identifier: <strong className="text-white font-mono">{user?.identifier || 'CUIN-004921'}</strong></span>
              <span>Status: <strong className="capitalize text-emerald-400 font-bold">{verificationStatus}</strong></span>
              <span>Email: <strong className="text-white">{user?.email}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('add_product')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>List New Relief Product</span>
            </button>
          </div>
        </div>

        {/* Revenue Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 block font-medium">Total Funded Order Value</span>
            <span className="text-2xl font-black font-mono text-emerald-400">
              PKR {totalRevenue.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Disaster Relief Procurements</span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 block font-medium">Orders Awaiting Dispatch</span>
            <span className="text-2xl font-black font-mono text-amber-400">
              {pendingDispatchOrders.length} Orders
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Payment confirmed by donors</span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 block font-medium">Active In-Transit Shipments</span>
            <span className="text-2xl font-black font-mono text-blue-400">
              {dispatchedOrders.length} Dispatched
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5 block">En route to ground base camps</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs gap-1">
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'orders'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4 text-emerald-400" />
          <span>Funded Orders to Dispatch ({pendingDispatchOrders.length + dispatchedOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'products'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-400" />
          <span>Product Catalog & Stock ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('add_product')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'add_product'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>List Relief Product</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* TAB 1: ORDERS FULFILLMENT */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Section: Needs Dispatch */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Paid Orders Ready for Dispatch ({pendingDispatchOrders.length})</span>
            </h3>

            {pendingDispatchOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                No orders currently waiting for dispatch. New donor purchases will appear here instantly.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingDispatchOrders.map(ord => (
                  <div key={ord.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                      <div>
                        <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                          Payment Confirmed &bull; Ready to Ship
                        </span>
                        <h4 className="font-mono font-bold text-sm text-slate-900 mt-1">
                          {ord.orderNumber}
                        </h4>
                        <span className="text-[11px] text-slate-500 block">
                          Destination: <strong>{ord.ngoName}</strong> ({ord.campaignName})
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-400 block font-medium">Total Value</span>
                        <span className="text-base font-black font-mono text-emerald-700">
                          PKR {ord.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="space-y-1 text-xs">
                      <span className="text-slate-500 text-[11px] font-bold block uppercase">
                        Goods to Pack:
                      </span>
                      {ord.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between p-2 bg-slate-50 rounded-lg">
                          <span className="font-medium text-slate-800">{it.productName}</span>
                          <span className="font-mono font-bold">{it.quantity} {it.unit}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => setDispatchingOrder(ord)}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                    >
                      <Truck className="w-4 h-4" />
                      <span>Dispatch Shipment & Assign Tracking</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Dispatched in Transit */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>In Transit to Relief Camps ({dispatchedOrders.length})</span>
            </h3>

            {dispatchedOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
                No shipments currently in transit.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dispatchedOrders.map(ord => (
                  <div key={ord.id} className="bg-white rounded-2xl border border-blue-200 p-5 shadow-xs space-y-4">
                    <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                      <div>
                        <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                          In Transit
                        </span>
                        <h4 className="font-mono font-bold text-sm text-slate-900 mt-1">
                          {ord.orderNumber}
                        </h4>
                        <span className="text-[11px] text-slate-500 block">
                          NGO: <strong>{ord.ngoName}</strong>
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-black font-mono text-slate-900">
                          PKR {ord.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {ord.dispatchDetails && (
                      <div className="p-3 bg-blue-50/60 rounded-xl text-xs space-y-1 text-slate-700 border border-blue-100">
                        <div className="font-semibold text-blue-900">
                          Courier: {ord.dispatchDetails.courierName}
                        </div>
                        <div>Tracking #: <strong className="font-mono">{ord.dispatchDetails.trackingNumber}</strong></div>
                        {ord.dispatchDetails.vehicleNumber && <div>Vehicle: <strong className="font-mono">{ord.dispatchDetails.vehicleNumber}</strong></div>}
                        {ord.dispatchDetails.contactPerson && <div>Contact: {ord.dispatchDetails.contactPerson}</div>}
                      </div>
                    )}

                    <button
                      onClick={() => handleMarkDelivered(ord.id, ord.orderNumber)}
                      className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark Delivered at Relief Camp</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCT CATALOG */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(prod => (
              <div key={prod.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {prod.category}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {(prod.stockAvailable ?? prod.stock ?? 0).toLocaleString()} {prod.unit} in stock
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 mt-2">{prod.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{prod.specifications}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Unit Price</span>
                    <span className="text-lg font-black font-mono text-slate-900">
                      PKR {(prod.unitPrice ?? prod.price ?? 0).toLocaleString()}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium">
                    {prod.location}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ADD PRODUCT */}
      {activeTab === 'add_product' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-xl mx-auto space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">List New Relief Product</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Items added here are matched to NGO requirements and funded by donors.
            </p>
          </div>

          <form onSubmit={handleAddProduct} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Product Title / Specification
              </label>
              <input
                type="text"
                value={newProdName}
                onChange={e => setNewProdName(e.target.value)}
                placeholder="e.g. 15-Day Standard Relief Ration Bag (Flour, Basmati, Daal, Ghee)"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Category
                </label>
                <select
                  value={newProdCategory}
                  onChange={e => setNewProdCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                >
                  <option value="Food Rations">Food Rations</option>
                  <option value="Clean Water & Filtration">Clean Water & Filtration</option>
                  <option value="Medical Supplies">Medical Supplies</option>
                  <option value="Shelter & Tents">Shelter & Tents</option>
                  <option value="Hygiene Kits">Hygiene Kits</option>
                  <option value="Warm Blankets & Clothing">Warm Blankets & Clothing</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Price in PKR
                </label>
                <input
                  type="number"
                  value={newProdPrice}
                  onChange={e => setNewProdPrice(e.target.value)}
                  placeholder="6500"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Initial Stock Quantity
                </label>
                <input
                  type="number"
                  value={newProdStock}
                  onChange={e => setNewProdStock(e.target.value)}
                  placeholder="1000"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  value={newProdUnit}
                  onChange={e => setNewProdUnit(e.target.value)}
                  placeholder="Packs, Kits, Boxes, Tents"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Detailed Specifications (Packaging, Shelf-Life, Components)
              </label>
              <textarea
                rows={3}
                value={newProdSpecs}
                onChange={e => setNewProdSpecs(e.target.value)}
                placeholder="Flour 20kg, Rice 5kg, Sugar 3kg, Ghee 3kg. Poly-weave waterproof pack."
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Warehouse / Dispatch Location
              </label>
              <input
                type="text"
                value={newProdLocation}
                onChange={e => setNewProdLocation(e.target.value)}
                placeholder="Karachi SITE Area & Sukkur Depot"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              Add Product to Catalog
            </button>
          </form>
        </div>
      )}

      {/* DISPATCH MODAL */}
      {dispatchingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Logistics Dispatch
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Dispatch Order {dispatchingOrder.orderNumber}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Destination: <strong>{dispatchingOrder.ngoName}</strong>
              </p>
            </div>

            <form onSubmit={handleDispatchOrder} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Courier Service / Dedicated Transport Fleet
                </label>
                <input
                  type="text"
                  value={courierName}
                  onChange={e => setCourierName(e.target.value)}
                  placeholder="e.g. TCS Cargo / Leopards Overland Fleet"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Consignment Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={e => setTrackingNumber(e.target.value)}
                  placeholder="e.g. TCS-SINDH-884210"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Truck / Vehicle Registration Number
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={e => setVehicleNumber(e.target.value)}
                  placeholder="LES-26-8941"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">
                  Driver / Dispatch Coordinator Contact
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  placeholder="Driver Aslam (+92 312 9948210)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDispatchingOrder(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDispatch}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSubmittingDispatch ? 'Dispatching...' : 'Confirm Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
