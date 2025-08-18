import {expectSuccess} from "./utils";

describe("analyzer/functionArguments", () => {
    expectSuccess(`// Function arguments can have the same name as their type.
        class button { }
         
        button get_button(button button, button other) { 
            return button;
        }
    `);
});