import { Clock } from "lucide-react";

function App() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-8">
      <div className="flex items-center gap-3 mb-4">
        <Clock className="w-10 h-10 text-indigo-600" />
        <h1 className="text-3xl font-bold tracking-tight">Clepsydre</h1>
      </div>
      <p className="text-gray-500">Redmine time tracking</p>
    </main>
  );
}

export default App;
