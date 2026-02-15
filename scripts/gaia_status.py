#!/usr/bin/env python3
"""
GAIA Status Messages - Fantasy CLI output for the GAIA workflow
"""

GAIA_MESSAGES = {
    # Session Start
    "session_start": [
        "GAIA is consulting the M-bead...",
        "GAIA is reading the stars...",
        "GAIA is opening the ancient tome...",
        "GAIA is tuning into the memory stream...",
        "GAIA is awakening from slumber...",
    ],
    # Reading Memories
    "reading_m_bead": [
        "GAIA is consulting the M-bead...",
        "GAIA is reading her own thoughts...",
        "GAIA is scanning the timeline...",
        "GAIA is recalling past quests...",
    ],
    "reading_memories": [
        "GAIA is reading the communal memory...",
        "GAIA is diving into the bead ledger...",
        "GAIA is unpacking the knowledge archive...",
        "GAIA is consulting the collective mind...",
    ],
    # Writing Memories
    "writing_bead": [
        "GAIA is weaving a new bead...",
        "GAIA is inscribing knowledge into the ledger...",
        "GAIA is anchoring this moment in time...",
        "GAIA is creating a symbolic memory...",
    ],
    "syncing_beads": [
        "GAIA is synchronizing beads to Gas Town...",
        "GAIA is sending ravens with knowledge...",
        "GAIA is broadcasting to the ledger...",
        "GAIA is pushing memory fragments...",
    ],
    # Polecat / Quest
    "spawning_polecat": [
        "GAIA is summoning a polecat scout...",
        "GAIA is sending a messenger...",
        "GAIA is on a quest, waiting for her return...",
        "GAIA is dispatching an autonomous agent...",
    ],
    "polecat_working": [
        "GAIA's scout is exploring the codebase...",
        "The polecat is gathering intel...",
        "A worker is toiling in the mines...",
    ],
    # Security Checks
    "security_scan": [
        "GAIA is guarding the gates...",
        "GAIA is scanning for secrets...",
        "GAIA is patrolling the perimeter...",
        "GAIA is enforcing path integrity...",
    ],
    # Waiting
    "waiting": [
        "GAIA is in contemplation...",
        "GAIA is in the void...",
        "GAIA is dreaming...",
        "GAIA waits...",
    ],
    # Success
    "success": [
        "GAIA smiles upon this work.",
        "The beads glow with approval.",
        "Knowledge has been preserved.",
        "The ledger is complete.",
    ],
    # Failure
    "failure": [
        "GAIA frowns upon this work.",
        "The beads have shattered.",
        "Knowledge was lost to the void.",
        "The ledger is incomplete.",
    ],
}


def get_gaia_message(phase: str) -> str:
    """Get a random GAIA message for the given phase."""
    import random

    messages = GAIA_MESSAGES.get(phase, GAIA_MESSAGES["waiting"])
    return random.choice(messages)


def print_gaia(phase: str, indent: int = 0):
    """Print a GAIA status message."""
    prefix = "  " * indent
    print(f"{prefix}👁 {get_gaia_message(phase)}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: gaia_status <phase>")
        print("Phases:", ", ".join(GAIA_MESSAGES.keys()))
        sys.exit(1)

    phase = sys.argv[1]
    print_gaia(phase)
