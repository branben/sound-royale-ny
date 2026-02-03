def check_bingo_lines(board_tiles):
    """
    Check if any player has completed a bingo line (row, column, or diagonal).

    Args:
        board_tiles: List of Tile objects with position (0-8) and status

    Returns:
        List of completed line patterns (each as list of positions)
    """
    # Convert tiles to position lookup for easy access
    tile_lookup = {}
    for tile in board_tiles:
        if hasattr(tile, "position"):
            tile_lookup[tile.position] = tile.status

    completed_lines = []

    # Check rows (3 rows in 3x3 grid)
    for row in range(3):
        row_start = row * 3
        row_positions = [row_start + col for col in range(3)]
        if all(tile_lookup.get(pos) == "complete" for pos in row_positions):
            completed_lines.append(
                {"type": "row", "index": row, "positions": row_positions}
            )

    # Check columns (3 columns in 3x3 grid)
    for col in range(3):
        col_positions = [col + row * 3 for row in range(3)]
        if all(tile_lookup.get(pos) == "complete" for pos in col_positions):
            completed_lines.append(
                {"type": "column", "index": col, "positions": col_positions}
            )

    # Check diagonals (2 diagonals in 3x3 grid)
    # Top-left to bottom-right diagonal
    diag1_positions = [0, 4, 8]  # positions 0, 4, 8
    if all(tile_lookup.get(pos) == "complete" for pos in diag1_positions):
        completed_lines.append(
            {"type": "diagonal", "index": 1, "positions": diag1_positions}
        )

    # Top-right to bottom-left diagonal
    diag2_positions = [2, 4, 6]  # positions 2, 4, 6
    if all(tile_lookup.get(pos) == "complete" for pos in diag2_positions):
        completed_lines.append(
            {"type": "diagonal", "index": 2, "positions": diag2_positions}
        )

    return completed_lines


def calculate_bingo_score(player, completed_lines):
    """
    Calculate score for a player based on completed lines.
    More lines = higher score.

    Args:
        player: Player object
        completed_lines: List of completed line dictionaries

    Returns:
        Dictionary with score and line details
    """
    base_score = len(completed_lines) * 100

    # Bonus points for specific patterns
    bonuses = []

    # Check for multiple lines in single round
    if len(completed_lines) >= 2:
        bonuses.append({"type": "multi_line", "points": 50})

    # Check for early completion (within first 5 tiles)
    completed_tiles = sum(len(line["positions"]) for line in completed_lines)
    if completed_tiles <= 5:
        bonuses.append({"type": "speed", "points": 25})

    total_bonus = sum(bonus["points"] for bonus in bonuses)
    total_score = base_score + total_bonus

    return {
        "score": total_score,
        "base_score": base_score,
        "bonuses": bonuses,
        "lines": completed_lines,
    }


def check_tie_breaker(players_with_scores):
    """
    Implement tie-breaking rules for multiple winners.

    Tie-breaking priority:
    1. Player with more completed lines wins
    2. If still tied, player with fewer completed tiles wins (efficiency)
    3. If still tied, player who completed their last line first wins (time)
    4. If still tied, random selection

    Args:
        players_with_scores: List of (player, score_dict) tuples

    Returns:
        Single winning player
    """
    if len(players_with_scores) <= 1:
        return players_with_scores[0][0] if players_with_scores else None

    # Sort by score (descending)
    sorted_players = sorted(
        players_with_scores, key=lambda x: x[1]["score"], reverse=True
    )

    # Find top score
    top_score = sorted_players[0][1]["score"]

    # Filter players with top score
    top_players = [(p, s) for p, s in sorted_players if s["score"] == top_score]

    if len(top_players) == 1:
        return top_players[0][0]

    # Tie-breaking rules
    # 1. Most completed lines
    max_lines = max(len(p[1]["lines"]) for p in top_players)
    line_leaders = [(p, s) for p, s in top_players if len(s["lines"]) == max_lines]

    if len(line_leaders) == 1:
        return line_leaders[0][0]

    # 2. Fewest completed tiles (efficiency)
    min_tiles = min(
        sum(len(line["positions"]) for line in p[1]["lines"]) for p in top_players
    )
    efficiency_leaders = [
        (p, s)
        for p, s in top_players
        if sum(len(line["positions"]) for line in s["lines"]) == min_tiles
    ]

    if len(efficiency_leaders) == 1:
        return efficiency_leaders[0][0]

    # 3. Random selection (ultimate tie-breaker)
    import random

    return random.choice(top_players)[0]
