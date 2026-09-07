CREATE OR REPLACE FUNCTION prevent_closed_cash_session_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'closed cash sessions are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cash_sessions_closed_immutable
BEFORE UPDATE ON cash_sessions
FOR EACH ROW EXECUTE FUNCTION prevent_closed_cash_session_change();
