-- Table removal deletes reveals before their restrictive player references.
-- SECURITY INVOKER requires this explicit grant; local default privileges may
-- otherwise hide the missing permission on hosted databases.
grant delete on table public.hand_card_reveals to service_role;
