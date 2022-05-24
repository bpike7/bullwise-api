CREATE TYPE option_types AS ENUM ('call', 'put');
CREATE TYPE position_states AS ENUM ('open', 'closed');

CREATE TABLE positions (
  id SERIAL PRIMARY KEY,
  tradier_id varchar(32),
  state position_states NOT NULL,
  contract_symbol varchar(64) NOT NULL,
  quantity INT NOT NULL,
  price_avg FLOAT NOT NULL,
  created_date timestamp NOT NULL DEFAULT now(),
  updated_date timestamp
);
create index positions_state on positions (state);
create index positions_contract_symbol on positions (contract_symbol);

CREATE TRIGGER positions_status_update
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE PROCEDURE trigger_set_timestamp();
