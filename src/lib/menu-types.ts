/**
 * Shapes shared by the server query and the client till. Kept in its own file
 * with no imports, so a client component can never accidentally pull a
 * server-only module in along with a type.
 */

export type MenuCategory = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
};

export type MenuItemDTO = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  emoji: string;
  priceCents: number;
  estCostCents: number;
  unit: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
};

export type MenuSnapshot = {
  at: string;
  currency: string;
  restaurantName: string;
  categories: MenuCategory[];
  items: MenuItemDTO[];
};
