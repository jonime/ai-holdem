import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerEnv } from "@/lib/env/server";
import {
  type GameDatabaseClient,
  SupabaseGameRepository,
} from "@/lib/supabase/queries";

export function createSupabaseServerClient(): SupabaseClient {
  const environment = getSupabaseServerEnv();

  return createClient(environment.supabaseUrl, environment.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createGameDatabaseClient(client: SupabaseClient): GameDatabaseClient {
  return {
    from: (table) => ({
      insert: (values) => ({
        select: () => ({
          single: async () => {
            const { data, error } = await client
              .from(table)
              .insert(values)
              .select()
              .single();
            return { data: data as unknown, error };
          },
        }),
      }),
      select: () => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            const { data, error } = await client
              .from(table)
              .select()
              .eq(column, value)
              .maybeSingle();
            return { data: data as unknown, error };
          },
        }),
      }),
      update: (values) => ({
        eq: (column, value) => ({
          eq: (secondColumn, secondValue) => ({
            select: () => ({
              single: async () => {
                const { data, error } = await client
                  .from(table)
                  .update(values)
                  .eq(column, value)
                  .eq(secondColumn, secondValue)
                  .select()
                  .single();
                return { data: data as unknown, error };
              },
            }),
          }),
        }),
      }),
    }),
    rpc: async (functionName, arguments_) => {
      const { data, error } = await client.rpc(functionName, arguments_);
      return { data: data as unknown, error };
    },
  };
}

export function createSupabaseGameRepository(): SupabaseGameRepository {
  return new SupabaseGameRepository(
    createGameDatabaseClient(createSupabaseServerClient()),
  );
}
