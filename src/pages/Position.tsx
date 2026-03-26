import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * /position now redirects to the main pipeline's Signal Positioning Report tab.
 * All positioning logic lives within Index.tsx's director tab — no duplicate input flow.
 */
const Position = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/?tab=director", { replace: true });
  }, [navigate]);

  return null;
};

export default Position;
