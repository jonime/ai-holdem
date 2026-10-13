import type { Database } from "./database.generated";
import type { ServerDatabase, CreationAttempt } from "./contracts";
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerEnv } from "@/lib/env/server";
import {
  type GameDatabaseClient,
  type FilteredQueryResult,
  type TableName,
  type TableInsert,
  type TableUpdate,
  type Row,
  SupabaseGameRepository,
} from "@/lib/supabase/queries";

export function createSupabaseServerClient(): SupabaseClient<ServerDatabase> {
  const environment = getSupabaseServerEnv();

  return createClient<ServerDatabase>(environment.supabaseUrl, environment.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

interface UpdateResult<T extends TableName> {
  eq<K extends keyof Row<T> & string>(column: K, value: Row<T>[K]): UpdateResult<T>;
  select(): { single(): PromiseLike<{ data: unknown; error: { message: string } | null }> };
}
function createGameDatabaseClient(client: SupabaseClient<ServerDatabase>): GameDatabaseClient {
  return {
    from: <T extends TableName>(table: T) => ({
      insert: (values: TableInsert<T>) => ({
        select: () => ({ single: async () => {
          const { data, error } = await client.from<T, Database["public"]["Tables"][T]>(table).insert<typeof values>(values).select().single();
          return { data, error };
        } }),
      }),
      select: (columns?: string) => ({
        eq: <K extends keyof Row<T> & string>(column: K, value: Row<T>[K]) => {
          function wrap(filters: readonly (readonly [keyof Row<T> & string, Row<T>[keyof Row<T>]])[]): FilteredQueryResult<T> {
            let query = client.from<T, Database["public"]["Tables"][T]>(table).select(columns);
            for (const [key, entry] of filters) query = query.filter(key, "eq", entry);
            return {
              eq: (key, entry) => wrap([...filters, [key, entry]]),
              then: query.then.bind(query),
              maybeSingle: async () => {
                const { data, error } = await query.maybeSingle();
                return { data, error };
              },
            };
          }
          return wrap([[column, value]]);
        },
      }),
      update: (values: TableUpdate<T>) => {
        const initial = client.from<T, Database["public"]["Tables"][T]>(table).update<typeof values>(values);
        const wrap = (query: typeof initial): UpdateResult<T> => ({
          eq: (key, entry) => wrap(query.filter(key, "eq", entry)),
          select: () => ({ single: async () => {
            const { data, error } = await query.select().single();
            return { data, error };
          } }),
        });
        return wrap(initial);
      },
    }),
    rpc: async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  };
}

export function createSupabaseGameRepository(creationAttempt?: CreationAttempt): SupabaseGameRepository {
  return new SupabaseGameRepository(
    createGameDatabaseClient(createSupabaseServerClient()),
    creationAttempt,
  );
}
