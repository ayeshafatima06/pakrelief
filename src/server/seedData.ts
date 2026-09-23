import { 
  Campaign, 
  Requirement, 
  Product, 
  NgoProfile, 
  SupplierProfile, 
  UserProfile, 
  Order, 
  Transaction 
} from '../types';

// Zero dummy or seed data in production
export const INITIAL_USERS: UserProfile[] = [];
export const INITIAL_NGOS: NgoProfile[] = [];
export const INITIAL_SUPPLIERS: SupplierProfile[] = [];
export const INITIAL_CAMPAIGNS: Campaign[] = [];
export const INITIAL_REQUIREMENTS: Requirement[] = [];
export const INITIAL_PRODUCTS: Product[] = [];
export const INITIAL_ORDERS: Order[] = [];
export const INITIAL_TRANSACTIONS: Transaction[] = [];
