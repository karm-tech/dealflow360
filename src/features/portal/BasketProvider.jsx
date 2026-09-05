import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";

// Per-user localStorage until the request is sent, so two logins on one machine
// do not share a basket.

const PREFIX = "dealflow360.basket";

export function lineKey(item) {
  return `${item.productId}:${item.variantId || 0}`;
}

const BasketContext = createContext(null);

function read(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    return Array.isArray(stored) ? stored : [];
  } catch {
    // Corrupted or hand-edited storage starts again rather than breaking the page.
    return [];
  }
}

export function BasketProvider({ children }) {
  const { user } = useAuth();
  const key = `${PREFIX}.${user?.id ?? "anon"}`;

  const [items, setItems] = useState(() => read(key));

  // Signing out and back in as someone else swaps the basket rather than
  // keeping whatever was on screen.
  useEffect(() => {
    setItems(read(key));
  }, [key]);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(items));
  }, [key, items]);

  // Adding what is already there raises the quantity, matching how the same
  // action behaves on the internal quotation form.
  const add = useCallback((product, qty = 1, variant = null) => {
    setItems((current) => {
      const variantId = variant?.id || null;
      const existing = current.find(
        (item) => item.productId === product.id && (item.variantId || null) === variantId,
      );
      if (existing) {
        return current.map((item) =>
          item.productId === product.id && (item.variantId || null) === variantId
            ? { ...item, qty: item.qty + qty }
            : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          variantId,
          variantLabel: variant ? `${variant.attribute}: ${variant.value}` : null,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          price: product.price + (variant?.extraPrice || 0),
          billingType: product.billingType,
          planName: product.planName,
          qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((key, qty) => {
    setItems((current) =>
      current.map((item) => (lineKey(item) === key ? { ...item, qty } : item)),
    );
  }, []);

  const remove = useCallback((key) => {
    setItems((current) => current.filter((item) => lineKey(item) !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = {
    items,
    count: items.reduce((sum, item) => sum + item.qty, 0),
    add,
    setQty,
    remove,
    clear,
  };

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket() {
  const context = useContext(BasketContext);
  if (!context) throw new Error("useBasket must be used inside a BasketProvider");
  return context;
}
