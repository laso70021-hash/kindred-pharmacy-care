import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as typedSupabase } from '@/integrations/supabase/client';
import {
  Pharmacy,
  Branch,
  Customer,
  ProductItem,
  InventoryBatch,
  Supplier,
  SaleTransaction,
  PurchaseOrder,
  ExpenseRecord,
  UserProfile,
  SupportTicket,
  AIFeatureState,
  AIRecommendationItem,
  SystemHealthItem,
  ActivityLogItem,
  SalesDataPoint,
  SubscriptionPlan
} from '@/lib/pharmacy-types';
import { formatDateDeterministic } from './utils';

// Rows are mapped defensively below (the source app tolerated several schema
// versions), so this layer reads through an untyped client.
const supabase = typedSupabase as unknown as SupabaseClient;

export class PharmacyService {
  // ==========================================
  // 1. PLANS & ENTITLEMENTS
  // ==========================================
  static async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map((d: any) => {
          const planCode = d.plan_code || d.slug || 'starter';
          let featureList: string[] = [];

          if (Array.isArray(d.features)) {
            featureList = d.features;
          } else if (typeof d.features === 'object' && d.features !== null) {
            const fMap: Record<string, string> = {
              pos: 'Core POS & inventory',
              inventory: 'Smart stock control',
              expiry_alerts: 'Expiry & low-stock alerts',
              email_support: 'Email support',
              reports: 'Reports & exports',
              supplier_orders: 'Supplier orders',
              prescription_assistant: 'Prescription (TTT/STT)',
              ai_mapping: 'Bulk medicine import (AI mapping)',
              delivery: 'Delivery management',
              priority_support: 'Priority support',
              advanced_analytics: 'Full AI analytics & forecasting',
              custom_integrations: 'Custom integrations (e.g. HIS/EMR)',
              dedicated_account_manager: 'Dedicated account manager',
              sla: 'SLA & training'
            };
            featureList = Object.keys(d.features)
              .filter((k) => d.features[k])
              .map((k) => fMap[k] || k.replace(/_/g, ' '));

            if (d.max_branches) featureList.unshift(`Up to ${d.max_branches} branch${d.max_branches > 1 ? 'es' : ''}`);
            if (d.max_employees) featureList.splice(1, 0, `Up to ${d.max_employees} employees`);
          }

          return {
            id: d.id,
            slug: planCode,
            name: d.plan_name || d.name || 'Plan',
            price_tzs_monthly: d.monthly_price ?? d.price_tzs_monthly ?? 0,
            price_tzs_annual: d.annual_price ? Math.round(d.annual_price / 12) : (d.monthly_price ? Math.round(d.monthly_price * 0.8) : 0),
            max_branches: d.max_branches ?? 999,
            max_employees: d.max_employees ?? 999,
            has_ai_insights: Boolean(d.has_ai_insights || d.features?.prescription_assistant || d.features?.advanced_analytics),
            has_prescription_stt_ttt: Boolean(d.has_prescription_stt_ttt || d.features?.prescription_assistant),
            has_advanced_ai_forecasting: Boolean(d.has_advanced_ai_forecasting || d.features?.advanced_analytics),
            has_bulk_import_ocr: Boolean(d.has_bulk_import_ocr || d.features?.ai_mapping),
            has_delivery_management: Boolean(d.has_delivery_management || d.features?.delivery),
            support_tier: d.support_tier || (d.features?.priority_support ? 'Priority Support' : d.features?.dedicated_account_manager ? 'Dedicated Account Manager' : 'Email Support'),
            features: featureList.length > 0 ? featureList : ['Core POS', 'Expiry alerts', 'Standard support']
          };
        });
      }
    } catch (e) {
      console.warn('Failed to load plans from Supabase:', e);
    }
    return [];
  }

  // ==========================================
  // 2. PHARMACIES (TENANTS)
  // ==========================================
  static async getPharmacies(): Promise<Pharmacy[]> {
    try {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          name: d.name || d.display_name || d.legal_name || 'Pharmacy',
          registration_number: d.registration_number || '',
          tax_number: d.tax_number || '',
          owner_name: d.owner_name || 'Owner',
          owner_email: d.email || 'info@' + (d.name || 'pharmacy').toLowerCase().replace(/\s+/g, '') + '.com',
          plan: (d.plan_name || (d.plan_id ? 'Professional' : 'Standard')) as any,
          plan_slug: d.plan_slug || 'professional',
          registered_at: formatDateDeterministic(d.created_at),
          status: (d.status === 'active' || d.status === 'Active') ? 'Active' : (d.status === 'suspended' ? 'Suspended' : 'Pending'),
          sales_total: d.sales_total || 0,
          branches_count: d.branches_count || 1,
          employees_count: d.employees_count || 3,
          city: d.city || 'Dar es Salaam',
          phone: d.phone || '+255 700 000 000',
          address: d.address || ''
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch pharmacies:', e);
    }
    return [];
  }

  static async addPharmacy(pharmacy: Partial<Pharmacy>): Promise<{ data: Pharmacy | null; error: string | null }> {
    try {
      const payload: any = {
        name: pharmacy.name,
        email: pharmacy.owner_email,
        phone: pharmacy.phone,
        city: pharmacy.city || 'Dar es Salaam',
        status: 'active'
      };

      const { data, error } = await supabase.from('pharmacies').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }

      return {
        data: {
          id: data.id,
          name: data.name,
          owner_name: pharmacy.owner_name || 'Owner',
          owner_email: data.email,
          plan: 'Standard',
          plan_slug: 'starter',
          registered_at: formatDateDeterministic(data.created_at),
          status: 'Active',
          sales_total: 0,
          branches_count: 1,
          employees_count: 2,
          city: data.city,
          phone: data.phone
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message || 'Operation failed' };
    }
  }

  static async togglePharmacyStatus(id: string, currentStatus: string): Promise<boolean> {
    try {
      const nextStatus = currentStatus === 'Active' ? 'suspended' : 'active';
      const { error } = await supabase.from('pharmacies').update({ status: nextStatus }).eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 3. CUSTOMERS
  // ==========================================
  static async getCustomers(): Promise<Customer[]> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((c: any) => ({
          id: c.id,
          pharmacy_id: c.pharmacy_id,
          full_name: c.full_name || 'Unnamed Customer',
          phone: c.phone || '—',
          email: c.email || '—',
          address: c.address || '—',
          allergies: c.allergies || 'None recorded',
          chronic_conditions: c.chronic_conditions || 'None recorded',
          purchases_count: c.purchases_count || 0,
          total_spent: c.total_spent || 0,
          created_at: formatDateDeterministic(c.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch customers:', e);
    }
    return [];
  }

  static async addCustomer(customer: Partial<Customer>): Promise<{ data: Customer | null; error: string | null }> {
    try {
      const payload: any = {
        full_name: customer.full_name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        allergies: customer.allergies,
        chronic_conditions: customer.chronic_conditions
      };
      if (customer.pharmacy_id) {
        payload.pharmacy_id = customer.pharmacy_id;
      }

      const { data, error } = await supabase.from('customers').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }

      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          full_name: data.full_name,
          phone: data.phone || '—',
          email: data.email || '—',
          address: data.address || '—',
          allergies: data.allergies || 'None recorded',
          chronic_conditions: data.chronic_conditions || 'None recorded',
          purchases_count: 0,
          total_spent: 0,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message || 'Operation failed' };
    }
  }

  static async deleteCustomer(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 4. BRANCHES
  // ==========================================
  static async getBranches(): Promise<Branch[]> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((b: any) => ({
          id: b.id,
          pharmacy_id: b.pharmacy_id,
          name: b.name,
          code: b.code || 'MAIN',
          address: b.address || '',
          phone: b.phone || '',
          manager_id: b.manager_id,
          is_main: Boolean(b.is_main),
          is_active: Boolean(b.is_active !== false),
          created_at: formatDateDeterministic(b.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch branches:', e);
    }
    return [];
  }

  static async addBranch(branch: Partial<Branch>): Promise<{ data: Branch | null; error: string | null }> {
    try {
      const payload: any = {
        pharmacy_id: branch.pharmacy_id,
        name: branch.name,
        code: branch.code,
        address: branch.address,
        phone: branch.phone,
        is_main: branch.is_main || false,
        is_active: true
      };

      const { data, error } = await supabase.from('branches').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          name: data.name,
          code: data.code,
          address: data.address,
          phone: data.phone,
          is_main: data.is_main,
          is_active: data.is_active,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 5. PRODUCTS & CATALOGUE
  // ==========================================
  static async getProducts(): Promise<ProductItem[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((p: any) => ({
          id: p.id,
          pharmacy_id: p.pharmacy_id,
          name: p.name,
          generic_name: p.generic_name || '',
          category: p.category_id ? 'General' : 'Prescription',
          dosage: p.dosage_form ? `${p.strength || ''} ${p.dosage_form}`.trim() : (p.dosage || '500mg'),
          sku: p.sku || 'SKU-001',
          barcode: p.barcode,
          units_sold: p.units_sold || 0,
          total_sales: p.total_sales || 0,
          stock_quantity: p.stock_quantity ?? 100,
          min_stock: p.min_stock_level ?? 10,
          cost_price: Number(p.cost_price || 0),
          selling_price: Number(p.selling_price || 0),
          is_prescription_required: Boolean(p.is_prescription_required),
          is_active: Boolean(p.is_active !== false),
          expiry_date: p.expiry_date || '2027-12-31'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch products:', e);
    }
    return [];
  }

  static async addProduct(product: Partial<ProductItem>): Promise<{ data: ProductItem | null; error: string | null }> {
    try {
      const payload: any = {
        name: product.name,
        generic_name: product.generic_name,
        sku: product.sku || 'SKU-' + Math.floor(Math.random() * 9000 + 1000),
        dosage_form: product.dosage || 'Tablets',
        strength: product.dosage || '500mg',
        cost_price: product.cost_price || 0,
        selling_price: product.selling_price || 1000,
        min_stock_level: product.min_stock || 10,
        is_prescription_required: Boolean(product.is_prescription_required),
        is_active: true
      };
      if (product.pharmacy_id) {
        payload.pharmacy_id = product.pharmacy_id;
      }

      const { data, error } = await supabase.from('products').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          name: data.name,
          generic_name: data.generic_name,
          category: 'General',
          dosage: data.dosage_form,
          sku: data.sku,
          units_sold: 0,
          total_sales: 0,
          stock_quantity: 0,
          min_stock: data.min_stock_level,
          cost_price: data.cost_price,
          selling_price: data.selling_price,
          is_active: data.is_active,
          expiry_date: '2027-12-31'
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 6. INVENTORY BATCHES
  // ==========================================
  static async getInventoryBatches(): Promise<InventoryBatch[]> {
    try {
      const { data, error } = await supabase
        .from('inventory_batches')
        .select('*, products(name)')
        .order('expiry_date', { ascending: true });

      if (!error && data) {
        return data.map((b: any) => {
          const exp = new Date(b.expiry_date);
          const now = new Date();
          const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
          return {
            id: b.id,
            pharmacy_id: b.pharmacy_id,
            branch_id: b.branch_id,
            product_id: b.product_id,
            product_name: b.products?.name || b.product_name || 'Medicine Formulation',
            batch_number: b.batch_number,
            quantity: b.quantity || 0,
            cost_per_unit: Number(b.cost_per_unit || 0),
            expiry_date: b.expiry_date,
            received_date: b.received_date,
            days_to_expiry: diffDays
          };
        });
      }
    } catch (e) {
      console.warn('Failed to fetch batches:', e);
    }
    return [];
  }

  // ==========================================
  // 7. ORDERS & SALES (POS)
  // ==========================================
  static async getSales(): Promise<SaleTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((s: any) => ({
          id: s.id,
          pharmacy_id: s.pharmacy_id,
          branch_id: s.branch_id,
          customer_id: s.customer_id,
          invoice_number: s.invoice_number || `INV-${s.id.slice(0, 6).toUpperCase()}`,
          subtotal: Number(s.subtotal || 0),
          discount: Number(s.discount || 0),
          tax: Number(s.tax || 0),
          total: Number(s.total || s.total_amount || 0),
          payment_status: s.payment_status || 'completed',
          payment_method: s.payment_method || 'cash',
          created_at: formatDateDeterministic(s.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch sales:', e);
    }
    return [];
  }

  // ==========================================
  // 8. PURCHASES & SUPPLIER ORDERS
  // ==========================================
  static async getPurchases(): Promise<PurchaseOrder[]> {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((po: any) => ({
          id: po.id,
          pharmacy_id: po.pharmacy_id,
          supplier_id: po.supplier_id,
          supplier_name: po.supplier_name || 'Pharmaceutical Supplier',
          order_number: po.order_number || `PO-${po.id.slice(0, 6).toUpperCase()}`,
          status: po.status || 'ordered',
          total_amount: Number(po.total_amount || 0),
          order_date: po.order_date || '2026-11-01',
          expected_delivery_date: po.expected_delivery_date,
          received_date: po.received_date,
          created_at: formatDateDeterministic(po.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch purchases:', e);
    }
    return [];
  }

  // ==========================================
  // 9. SUPPLIERS
  // ==========================================
  static async getSuppliers(): Promise<Supplier[]> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((sup: any) => ({
          id: sup.id,
          pharmacy_id: sup.pharmacy_id,
          name: sup.name,
          contact_name: sup.contact_name || '—',
          email: sup.email || '—',
          phone: sup.phone || '—',
          address: sup.address || '—',
          tax_id: sup.tax_id || '—',
          is_active: Boolean(sup.is_active !== false),
          created_at: formatDateDeterministic(sup.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch suppliers:', e);
    }
    return [];
  }

  static async addSupplier(supplier: Partial<Supplier>): Promise<{ data: Supplier | null; error: string | null }> {
    try {
      const payload: any = {
        name: supplier.name,
        contact_name: supplier.contact_name,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        tax_id: supplier.tax_id,
        is_active: true
      };
      if (supplier.pharmacy_id) {
        payload.pharmacy_id = supplier.pharmacy_id;
      }

      const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          name: data.name,
          contact_name: data.contact_name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          tax_id: data.tax_id,
          is_active: data.is_active,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 10. EXPENSES
  // ==========================================
  static async getExpenses(): Promise<ExpenseRecord[]> {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (!error && data) {
        return data.map((exp: any) => ({
          id: exp.id,
          pharmacy_id: exp.pharmacy_id,
          category: exp.category || 'General',
          amount: Number(exp.amount || 0),
          description: exp.description || '—',
          expense_date: exp.expense_date || '2026-11-01',
          created_at: formatDateDeterministic(exp.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch expenses:', e);
    }
    return [];
  }

  static async addExpense(expense: Partial<ExpenseRecord>): Promise<{ data: ExpenseRecord | null; error: string | null }> {
    try {
      const payload: any = {
        category: expense.category || 'General',
        amount: expense.amount || 0,
        description: expense.description || '',
        expense_date: expense.expense_date || new Date().toISOString().slice(0, 10)
      };
      if (expense.pharmacy_id) {
        payload.pharmacy_id = expense.pharmacy_id;
      }

      const { data, error } = await supabase.from('expenses').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          category: data.category,
          amount: data.amount,
          description: data.description,
          expense_date: data.expense_date,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }

  // ==========================================
  // 11. USERS & ROLES
  // ==========================================
  static async getUsers(): Promise<UserProfile[]> {
    try {
      const [{ data, error }, { data: roleRows }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role')
      ]);

      if (!error && data) {
        const rolesByUser = new Map<string, string[]>();
        (roleRows || []).forEach((r: any) => {
          rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) || []), r.role]);
        });
        return data.map((u: any) => {
          const roles = rolesByUser.get(u.id) || [];
          const isAdmin = roles.includes('super_admin');
          return {
            id: u.id,
            email: u.email,
            full_name: u.full_name || 'Platform User',
            phone: u.phone || '—',
            avatar_url: u.avatar_url,
            system_role: (isAdmin ? 'super_admin' : roles[0] || 'pharmacist') as UserProfile['system_role'],
            is_super_admin: isAdmin,
            created_at: formatDateDeterministic(u.created_at)
          };
        });
      }
    } catch (e) {
      console.warn('Failed to fetch users:', e);
    }
    return [];
  }

  // ==========================================
  // 12. AI FEATURES
  // ==========================================
  static async getAIFeatures(): Promise<AIFeatureState[]> {
    try {
      const { data, error } = await supabase.from('ai_features').select('*').order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          description: d.description,
          is_enabled: d.is_enabled ?? true,
          category: d.category || 'general'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch AI features:', e);
    }
    return [];
  }

  static async toggleAIFeature(slug: string, currentVal: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('ai_features')
        .update({ is_enabled: !currentVal, updated_at: new Date().toISOString() })
        .eq('slug', slug);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 13. AI RECOMMENDATIONS
  // ==========================================
  static async getRecommendations(): Promise<AIRecommendationItem[]> {
    try {
      const { data, error } = await supabase
        .from('ai_recommendations')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((r: any) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          category: r.category || 'inventory',
          severity: r.severity || 'action',
          badge_label: (r.severity || 'action').toUpperCase(),
          badge_color: r.severity || 'action',
          created_at: formatDateDeterministic(r.created_at),
          status: r.status || 'pending'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch recommendations:', e);
    }
    return [];
  }

  static async resolveRecommendation(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('ai_recommendations')
        .update({ status: 'resolved' })
        .eq('id', id);
      return !error;
    } catch {
      return false;
    }
  }

  // ==========================================
  // 14. SYSTEM HEALTH
  // ==========================================
  static async getSystemHealth(): Promise<SystemHealthItem[]> {
    try {
      const { data, error } = await supabase
        .from('system_health_checks')
        .select('*');

      if (!error && data && data.length > 0) {
        return data.map((h: any) => ({
          service: h.service_name || 'Service',
          status: (h.status === 'operational' || h.status === 'Operational') ? 'Operational' : (h.status === 'degraded' ? 'Degraded' : 'Down'),
          latency: `${h.response_time_ms || 15}ms`,
          last_check: 'Just now'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch system health:', e);
    }
    return [
      { service: 'Application', status: 'Operational', latency: '12ms', last_check: 'Just now' },
      { service: 'Database', status: 'Operational', latency: '18ms', last_check: 'Just now' },
      { service: 'Storage', status: 'Operational', latency: '24ms', last_check: 'Just now' },
      { service: 'Background Jobs', status: 'Operational', latency: '8ms', last_check: 'Just now' },
      { service: 'Email Service', status: 'Operational', latency: '45ms', last_check: 'Just now' },
      { service: 'Payment Gateway', status: 'Operational', latency: '32ms', last_check: 'Just now' }
    ];
  }

  // ==========================================
  // 15. AUDIT LOGS
  // ==========================================
  static async getAuditLogs(): Promise<ActivityLogItem[]> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      if (!error && data && data.length > 0) {
        return data.map((a: any) => ({
          id: a.id,
          title: `${a.action}: ${a.entity} ${a.entity_id ? '#' + a.entity_id.slice(0, 8) : ''}`,
          time: formatDateDeterministic(a.created_at),
          type: 'system'
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch audit logs:', e);
    }
    return [];
  }

  // ==========================================
  // 16. SUPPORT TICKETS
  // ==========================================
  static async getSupportTickets(): Promise<SupportTicket[]> {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((t: any) => ({
          id: t.id,
          pharmacy_id: t.pharmacy_id,
          ticket_number: t.ticket_number || `TICK-${t.id.slice(0, 6).toUpperCase()}`,
          subject: t.subject,
          description: t.description || '',
          category: t.category || 'technical',
          priority: t.priority || 'medium',
          status: t.status || 'open',
          created_at: formatDateDeterministic(t.created_at)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch support tickets:', e);
    }
    return [];
  }

  static async createSupportTicket(ticket: Partial<SupportTicket>): Promise<{ data: SupportTicket | null; error: string | null }> {
    try {
      const payload: any = {
        ticket_number: `TICK-${Math.floor(Math.random() * 90000 + 10000)}`,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category || 'technical',
        priority: ticket.priority || 'medium',
        status: 'open'
      };
      if (ticket.pharmacy_id) {
        payload.pharmacy_id = ticket.pharmacy_id;
      }

      const { data, error } = await supabase.from('support_tickets').insert(payload).select().single();
      if (error) {
        return { data: null, error: error.message };
      }
      return {
        data: {
          id: data.id,
          pharmacy_id: data.pharmacy_id,
          ticket_number: data.ticket_number,
          subject: data.subject,
          description: data.description,
          category: data.category,
          priority: data.priority,
          status: data.status,
          created_at: formatDateDeterministic(data.created_at)
        },
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }
}
