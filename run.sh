#!/bin/bash

while true; do
    echo "🕒 $(date): Start nieuw toernooi"
    node tournament.js
    echo "⏳ Wacht op volgende toernooi (5 seconden)..."
    sleep 5
done
