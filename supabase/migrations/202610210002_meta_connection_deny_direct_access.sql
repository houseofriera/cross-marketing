create policy meta_oauth_states_no_client_access
  on public.meta_oauth_states
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy meta_social_connections_no_client_access
  on public.meta_social_connections
  for all
  to anon, authenticated
  using (false)
  with check (false);

