package com.ivisit.helper.service;

import org.springframework.stereotype.Service;

import javax.smartcardio.*;
import java.util.List;

@Service
public class RfidService {

    private TerminalFactory terminalFactory;
    private CardTerminals cachedTerminals;

    private synchronized TerminalFactory getFactory() {
        if (terminalFactory == null) {
            terminalFactory = TerminalFactory.getDefault();
        }
        return terminalFactory;
    }

    public synchronized void resetScanner() {
        System.out.println("[RfidService] Resetting smartcard context...");

        terminalFactory = null;
        cachedTerminals = null;

        try {
            Thread.sleep(1000); // allow OS to re-enumerate USB
        } catch (InterruptedException ignored) {}
    }

    public java.util.List<CardTerminal> listTerminals() throws CardException {
        TerminalFactory factory = getFactory();
        cachedTerminals = factory.terminals();
        return cachedTerminals.list();
    }

    public String readCardUID(int timeoutMs) throws Exception {
        // System.out.println("[RfidService] readCardUID called with timeoutMs=" + timeoutMs);

        List<CardTerminal> terminals;

        try {
            TerminalFactory factory = getFactory();
            cachedTerminals = factory.terminals();
            terminals = cachedTerminals.list();
        } catch (CardException e) {
            System.out.println("[RfidService] CardException during terminal listing. Forcing reset.");
            resetScanner();
            throw e;
        }

        //System.out.println("[RfidService] terminals found = " + terminals.size());
        //for (int i = 0; i < terminals.size(); i++) {
        //    System.out.println("  [" + i + "] " + terminals.get(i).getName());
        //}

        if (terminals.isEmpty()) {
            throw new IllegalStateException("No card terminals found");
        }

        // Prefer the CL (contactless) reader
        CardTerminal terminal = selectContactlessTerminal(terminals);

        //System.out.println("[RfidService] using terminal: " + terminal.getName());

        boolean present = terminal.waitForCardPresent(timeoutMs);
        //System.out.println("[RfidService] waitForCardPresent -> " + present);

        if (!present) {
            return null; // timeout, no card
        }

        Card card = terminal.connect("*");
        try {
            CardChannel channel = card.getBasicChannel();

            byte[] getUidCmd = new byte[] {(byte)0xFF,(byte)0xCA,0x00,0x00,0x00};
            ResponseAPDU resp = channel.transmit(new CommandAPDU(getUidCmd));
            int sw = resp.getSW();
            System.out.println("[RfidService] response SW=" + Integer.toHexString(sw));

            if (sw == 0x9000) {
                byte[] uidBytes = resp.getData();
                String uidHex = bytesToHex(uidBytes);
                System.out.println("[RfidService] UID hex = " + uidHex);
                return uidHex;
            } else {
                System.out.println("[RfidService] GET UID not supported or failed.");
                return null;
            }
        } finally {
            card.disconnect(false);
            terminal.waitForCardAbsent(500);
        }
    }

    private CardTerminal selectContactlessTerminal(List<CardTerminal> terminals) {
        // Try to find a reader whose name suggests "contactless"
        for (CardTerminal t : terminals) {
            String name = t.getName().toLowerCase();
            if (name.contains("cl") || name.contains("5422cl") || name.contains("contactless")) {
                System.out.println("[RfidService] selected contactless terminal: " + t.getName());
                return t;
            }
        }
        // If none matched, just use the first one (better than crashing)
        System.out.println("[RfidService] no explicit CL terminal found, falling back to index 0");
        return terminals.get(0);
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02X", b));
        return sb.toString();
    }
}
