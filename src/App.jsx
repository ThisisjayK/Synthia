import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

function App() {
  const [status, setStatus] = useState("Testing connection...");

  useEffect(() => {
    async function testConnection() {
      const { error } = await supabase.from("projects").select("id").limit(1);
      if (error) {
        setStatus("Connection error: " + error.message);
      } else {
        setStatus("Supabase connected. Query to projects table succeeded.");
      }
    }
    testConnection();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Synthia, connection test
      </h1>
      <p className="mt-4 text-lg text-gray-700">{status}</p>
    </div>
  );
}

export default App;
