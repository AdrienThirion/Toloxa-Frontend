import React from "react";
import "../styles.css"; // Import the CSS file

function ApplianceCard({ image, title }) {
    return (
        <div className="appliance-card">
            <img src={image} alt={title} className="appliance-icon" />
            <h2 className="appliance-title">{title}</h2>
        </div>
    );
}

export default ApplianceCard;