import { Link } from "react-router-dom";

function VocalAssistant() {
    return (
        <div className="container">
            <h1>Vocal Assistant</h1>
            <p>Cliquez sur le bouton pour retourner au diagnostic.</p>
            <Link to="/">
                <button>Retour au Diagnostic</button>
            </Link>
        </div>
    );
}

export default VocalAssistant;
