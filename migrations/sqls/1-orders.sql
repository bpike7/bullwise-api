CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_date = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE orders_states AS ENUM ('accepted', 'sent', 'open', 'partially_filled', 'filled', 'expired', 'canceled', 'pending', 'rejected', 'error');
CREATE TYPE orders_sides AS ENUM ('buy_to_open', 'sell_to_close');
CREATE TYPE orders_types AS ENUM ('market', 'stop');

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL,
  tradier_id varchar(32),
  position_id INT,
  state orders_states NOT NULL,
  contract_symbol varchar(64) NOT NULL,
  quantity INT NOT NULL,
  price FLOAT NOT NULL,
  type orders_types NOT NULL,
  side orders_sides NOT NULL,
  created_date timestamp NOT NULL DEFAULT now(),
  updated_date timestamp
);
create index orders_state on orders (state);
create index orders_contract_symbol on orders (contract_symbol);

CREATE TRIGGER orders_status_update
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE PROCEDURE trigger_set_timestamp();
