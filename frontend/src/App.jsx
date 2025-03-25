import { BrowserRouter, Routes, Route } from "react-router-dom";
import DiagnoseStart from "./pages/DiagnoseStart";
// import VocalAssistant from "./pages/VocalAssistant";
import VocalAssistant from "./pages/VocalAssistant";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<DiagnoseStart />} />
                <Route path="/vocal-assistant" element={<VocalAssistant />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;