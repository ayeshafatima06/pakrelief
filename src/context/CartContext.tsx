import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Product, Requirement, Campaign } from '../types';

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, requirement: Requirement, campaign: Campaign, quantity?: number) => void;
  removeItem: (productId: string, requirementId: string) => void;
  updateQuantity: (productId: string, requirementId: string, quantity: number) => void;
  clearCart: () => void;
  totalAmount: number;
  totalItemsCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('pakrelief_cart');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('pakrelief_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (product: Product, requirement: Requirement, campaign: Campaign, quantity: number = 1) => {
    setItems(prev => {
      const existingIndex = prev.findIndex(
        it => it.productId === product.id && it.requirementId === requirement.id
      );

      const maxRemaining = Math.max(0, requirement.quantityNeeded - requirement.quantityFunded);

      if (existingIndex > -1) {
        const next = [...prev];
        const newQty = Math.min(next[existingIndex].quantity + quantity, maxRemaining || 999);
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: newQty
        };
        return next;
      } else {
        const newItem: CartItem = {
          requirementId: requirement.id,
          campaignId: campaign.id,
          campaignName: campaign.disasterName,
          ngoId: campaign.ngoId,
          ngoName: campaign.ngoName,
          productId: product.id,
          productName: product.name,
          supplierId: product.supplierId,
          supplierName: product.supplierName,
          itemType: requirement.itemType,
          category: requirement.category,
          quantity: Math.min(quantity, maxRemaining || 1),
          unitPrice: product.unitPrice ?? product.price ?? 0,
          unit: product.unit || requirement.unit,
          maxNeededRemaining: maxRemaining
        };
        return [...prev, newItem];
      }
    });

    setIsCartOpen(true);
  };

  const removeItem = (productId: string, requirementId: string) => {
    setItems(prev => prev.filter(it => !(it.productId === productId && it.requirementId === requirementId)));
  };

  const updateQuantity = (productId: string, requirementId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId, requirementId);
      return;
    }

    setItems(prev =>
      prev.map(it => {
        if (it.productId === productId && it.requirementId === requirementId) {
          const maxRemaining = (it.maxNeededRemaining ?? 0) > 0 ? (it.maxNeededRemaining as number) : 999;
          return {
            ...it,
            quantity: Math.min(quantity, maxRemaining)
          };
        }
        return it;
      })
    );
  };

  const clearCart = () => {
    setItems([]);
    localStorage.removeItem('pakrelief_cart');
  };

  const totalAmount = items.reduce((acc, it) => acc + (it.unitPrice * it.quantity), 0);
  const totalItemsCount = items.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalAmount,
        totalItemsCount,
        isCartOpen,
        setIsCartOpen,
        isCheckoutOpen,
        setIsCheckoutOpen
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
};
