-- All application data is isolated from Supabase's public REST schemas.
CREATE SCHEMA IF NOT EXISTS okpora;
SET search_path TO okpora, public;
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK(email=lower(email)),
 name text NOT NULL, phone text NOT NULL DEFAULT '', password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin','super_admin')),
 email_verified boolean NOT NULL DEFAULT false, disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,csrf_token text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE auth_tokens (token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,purpose text NOT NULL CHECK(purpose IN ('reset','verify')),expires_at timestamptz NOT NULL);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL DEFAULT 1, reset_at timestamptz NOT NULL);
CREATE TABLE addresses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,label text NOT NULL DEFAULT 'Home',details jsonb NOT NULL);
CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,slug text NOT NULL UNIQUE,image text NOT NULL DEFAULT '',position integer NOT NULL DEFAULT 0);
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,slug text NOT NULL UNIQUE,sku text NOT NULL UNIQUE,
 description text NOT NULL DEFAULT '',brand text NOT NULL DEFAULT '',price integer NOT NULL CHECK(price>=0),compare_price integer CHECK(compare_price>=0),
 image text NOT NULL DEFAULT '',featured boolean NOT NULL DEFAULT false,new_arrival boolean NOT NULL DEFAULT false,visible boolean NOT NULL DEFAULT true,
 attributes jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_search_idx ON products USING gin(to_tsvector('english',name || ' ' || description || ' ' || sku || ' ' || brand));
CREATE TABLE product_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,url text NOT NULL,position integer NOT NULL DEFAULT 0);
CREATE TABLE product_categories (product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,category_id uuid NOT NULL REFERENCES categories ON DELETE CASCADE,PRIMARY KEY(product_id,category_id));
CREATE TABLE product_variants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,sku text NOT NULL UNIQUE,name text NOT NULL DEFAULT 'Standard',size text NOT NULL DEFAULT '',color text NOT NULL DEFAULT '',price integer CHECK(price>=0),active boolean NOT NULL DEFAULT true);
CREATE TABLE inventory (variant_id uuid PRIMARY KEY REFERENCES product_variants ON DELETE CASCADE,quantity integer NOT NULL DEFAULT 0 CHECK(quantity>=0),low_stock_threshold integer NOT NULL DEFAULT 5 CHECK(low_stock_threshold>=0));
CREATE TABLE carts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES users ON DELETE CASCADE,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE cart_items (cart_id uuid NOT NULL REFERENCES carts ON DELETE CASCADE,variant_id uuid NOT NULL REFERENCES product_variants ON DELETE CASCADE,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),PRIMARY KEY(cart_id,variant_id));
CREATE TABLE wishlists (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES users ON DELETE CASCADE);
CREATE TABLE wishlist_items (wishlist_id uuid NOT NULL REFERENCES wishlists ON DELETE CASCADE,product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,PRIMARY KEY(wishlist_id,product_id));
CREATE TABLE delivery_zones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,country text NOT NULL DEFAULT 'Nigeria',region text NOT NULL DEFAULT '',city text NOT NULL DEFAULT '',fee integer NOT NULL CHECK(fee>=0),free_threshold integer CHECK(free_threshold>=0),min_days integer NOT NULL CHECK(min_days>=0),max_days integer NOT NULL CHECK(max_days>=min_days),active boolean NOT NULL DEFAULT true);
CREATE TABLE coupons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE CHECK(code=upper(code)),kind text NOT NULL CHECK(kind IN ('percentage','fixed','free_shipping')),value integer NOT NULL CHECK(value>=0),starts_at timestamptz,expires_at timestamptz,usage_limit integer CHECK(usage_limit>0),minimum integer NOT NULL DEFAULT 0,maximum integer,product_ids uuid[] NOT NULL DEFAULT '{}',category_ids uuid[] NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,CHECK(kind <> 'percentage' OR value<=100));
CREATE SEQUENCE order_number_seq;
CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),number text NOT NULL UNIQUE DEFAULT ('ORD-'||to_char(now(),'YYYY')||'-'||lpad(nextval('order_number_seq')::text,6,'0')),
 user_id uuid NOT NULL REFERENCES users,checkout_key uuid NOT NULL,request_hash text NOT NULL,
 subtotal integer NOT NULL CHECK(subtotal>=0),discount integer NOT NULL CHECK(discount>=0),delivery_fee integer NOT NULL CHECK(delivery_fee>=0),tax integer NOT NULL DEFAULT 0 CHECK(tax>=0),total integer NOT NULL CHECK(total>0),currency text NOT NULL,
 provider text NOT NULL CHECK(provider IN ('paystack','flutterwave','stripe')),payment_reference text NOT NULL UNIQUE,
 provider_session text,checkout_url text,payment_status text NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','failed','refund_pending','refunded')),
 status text NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','paid','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','refunded')),
 address jsonb NOT NULL,min_days integer NOT NULL,max_days integer NOT NULL,coupon_id uuid REFERENCES coupons,
 stock_state text NOT NULL DEFAULT 'reserved' CHECK(stock_state IN ('reserved','released','committed')),
 reserved_until timestamptz NOT NULL DEFAULT now()+interval '30 minutes',paid_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,checkout_key)
);
CREATE INDEX orders_user_idx ON orders(user_id,created_at DESC);
CREATE INDEX orders_pending_idx ON orders(payment_status,reserved_until);
CREATE TABLE order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders ON DELETE CASCADE,product_id uuid NOT NULL REFERENCES products,variant_id uuid NOT NULL REFERENCES product_variants,name text NOT NULL,variant text NOT NULL,sku text NOT NULL,image text NOT NULL,price integer NOT NULL CHECK(price>=0),quantity integer NOT NULL CHECK(quantity>0));
CREATE INDEX order_items_variant_idx ON order_items(variant_id);
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL UNIQUE REFERENCES orders,provider text NOT NULL,provider_transaction text NOT NULL,reference text NOT NULL,amount integer NOT NULL,currency text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,provider_transaction));
CREATE TABLE transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders,kind text NOT NULL CHECK(kind IN ('payment','refund')),reference text NOT NULL,provider text NOT NULL,amount integer NOT NULL,currency text NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE webhook_events (provider text NOT NULL,event_id text NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id));
CREATE TABLE refund_requests (order_id uuid PRIMARY KEY REFERENCES orders,provider_ref text,status text NOT NULL DEFAULT 'requested',requested_by uuid NOT NULL REFERENCES users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE coupon_usage (coupon_id uuid NOT NULL REFERENCES coupons,order_id uuid NOT NULL UNIQUE REFERENCES orders,user_id uuid NOT NULL REFERENCES users,PRIMARY KEY(coupon_id,order_id));
CREATE TABLE shipments (order_id uuid PRIMARY KEY REFERENCES orders ON DELETE CASCADE,courier text NOT NULL DEFAULT '',tracking_number text NOT NULL DEFAULT '',tracking_url text NOT NULL DEFAULT '');
CREATE TABLE order_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders ON DELETE CASCADE,status text NOT NULL,note text NOT NULL DEFAULT '',actor_id uuid REFERENCES users,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE order_notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders ON DELETE CASCADE,admin_id uuid NOT NULL REFERENCES users,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products,user_id uuid NOT NULL REFERENCES users,rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(product_id,user_id));
CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users ON DELETE CASCADE,audience text NOT NULL CHECK(audience IN ('admin','customer')),title text NOT NULL,body text NOT NULL,order_id uuid REFERENCES orders,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE newsletter_subscribers (email text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE contact_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,message text NOT NULL,status text NOT NULL DEFAULT 'new',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE site_settings (key text PRIMARY KEY,value jsonb NOT NULL);
CREATE TABLE admin_settings (key text PRIMARY KEY,value jsonb NOT NULL);
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_id uuid REFERENCES users,action text NOT NULL,object_type text NOT NULL,object_id text,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE email_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dedupe_key text NOT NULL UNIQUE,recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),locked_until timestamptz,sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO site_settings(key,value) VALUES ('store','{"name":"Okpora","currency":"NGN","announcement":"Considered essentials. Everyday favourites.","hero_title":"Good things.\nEvery day.","hero_text":"Discover thoughtful pieces for the way you live. A little style, a little comfort, all yours.","hero_image":"","hero_label":"THE EVERYDAY EDIT","email":"","phone":"","address":"","whatsapp":"","instagram":"","facebook":"","footer":"Considered essentials for everyday living.","tax_percent":0,"about":"Okpora brings together thoughtful essentials for everyday living. Discover fashion, home and technology in one considered collection.","faqs":[{"category":"Orders","question":"Where can I find my order?","answer":"Sign in and open My orders to see your payment and delivery updates."},{"category":"Payments","question":"How do I pay?","answer":"At checkout, you will be redirected to our secure payment provider. Your order is confirmed after payment verification."},{"category":"Delivery","question":"When will my order arrive?","answer":"Enter your address at checkout to see delivery fees and a business-day estimate for your area."}]}'),('policies','{}');
-- When using Supabase, do NOT expose the okpora schema through its Data API.
REVOKE ALL ON SCHEMA okpora FROM PUBLIC;
