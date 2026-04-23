#include "utility.as"

class Player {
    int health;
    string name;

    void heal(int amount) {
        health += amount;
    }
}

const int MAX_HEALTH = 100;

void main() {
    Player player;
    player.health = MAX_HEALTH;
    player.heal(5);
    int score = makeScore(player.health);
    Print("score");
}
