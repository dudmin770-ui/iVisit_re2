// src/features/rfid/RfidPollingContext.tsx
import { createContext, useContext, useState } from "react";

type RfidExclusiveOwner = "startLog" | "logDetails" | null;

type RfidPollingContextValue = {
    pollingEnabled: boolean;
    setPollingEnabled: (enabled: boolean) => void;
    exclusiveOwner: RfidExclusiveOwner;
    setExclusiveOwner: (owner: RfidExclusiveOwner) => void;
};

const RfidPollingContext = createContext<RfidPollingContextValue | null>(null);

export function RfidPollingProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [pollingEnabled, setPollingEnabled] = useState(true);
    const [exclusiveOwner, setExclusiveOwner] = useState<RfidExclusiveOwner>(null);

    return (
        <RfidPollingContext.Provider
            value={{ pollingEnabled, setPollingEnabled, exclusiveOwner, setExclusiveOwner }}
        >
            {children}
        </RfidPollingContext.Provider>
    );
}

export function useRfidPollingControl() {
    const ctx = useContext(RfidPollingContext);
    if (!ctx) {
        throw new Error(
            "useRfidPollingControl must be used inside RfidPollingProvider"
        );
    }
    return ctx;
}
