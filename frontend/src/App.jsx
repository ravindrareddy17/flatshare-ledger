import { Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Settlements from "./pages/Settlements";
import ImportCsv from "./pages/ImportCsv";
import People from "./pages/People";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/settlements" element={<Settlements />} />
        <Route path="/import" element={<ImportCsv />} />
        <Route path="/people" element={<People />} />
      </Route>
    </Routes>
  );
}

export default App;
