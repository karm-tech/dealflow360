import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../../app/AuthProvider";

// The basket is the customer's own working note, so it stays in their browser
// until they send it. Nothing half-finished reaches the database, and closing
// the tab does not lose it.
//
// Keyed by user id because two people may sign in from the same machine, and
// the second must not inherit the first one's basket. It is a context rather
// than a plain hook so the count in the header and the basket page are the
// same list, not two copies that drift apart.

const PREFIX = "dealflow360.basket";

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
  const add = useCallback((product, qty = 1) => {
    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id ? { ...item, qty: item.qty + qty } : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          price: product.price,
          billingType: product.billingType,
          planName: product.planName,
          qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((productId, qty) => {
    setItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, qty } : item)),
    );
  }, []);

  const remove = useCallback((productId) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
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
