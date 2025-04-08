import {expectError, expectSuccess} from "./utils";
import {afterEach} from "node:test";
import {copyGlobalSettings, getGlobalSettings, resetGlobalSettings} from "../../../src/core/settings";

describe('analyzer/property', () => {
    afterEach(() => {
        resetGlobalSettings(undefined);
    });

    expectSuccess(`// 'property' is contextual keywords.
        void main(){
            int property = 1;
        }
    `);

    expectSuccess(`// getter and setter are available.
        class Value {
            private int m_value;
            int value { get { return m_value; } set { m_value = value; } }
        }
        
        void main() {
            Value v;
            v.value = v.value + 1;
        }
    `);

    expectSuccess(`// Methods marked with 'property' can be used as properties.
        class Value {
            private int m_value;
            int set_value(int value) property { m_value = value; }
            int get_value() const property { return m_value; }
        }
        
        void main() {
            Value v;
            v.value = v.value + 1;
        }
    `).onBegin(() => {
        const settings = copyGlobalSettings();
        settings.explicitPropertyAccessor = true;
        resetGlobalSettings(settings);
    });

    expectError(`// Methods marked without 'property' can't be used as properties in modern AngelScript.
        class Value {
            private int m_value;
            int set_value(int value) { m_value = value; }
            int get_value() const { return m_value; }
        }
        
        void main() {
            Value v;
            v.value = v.value + 1;
        }
    `).onBegin(() => {
        const settings = copyGlobalSettings();
        settings.explicitPropertyAccessor = true;
        resetGlobalSettings(settings);
    });

    expectSuccess(`// Methods marked without 'property' can be used as properties prior to v2.33.1
        class Value {
            private int m_value;
            int set_value(int value) { m_value = value; }
            int get_value() const { return m_value; }
        }
        
        void main() {
            Value v;
            v.value = v.value + 1;
        }
    `).onBegin(() => {
        const settings = copyGlobalSettings();
        settings.explicitPropertyAccessor = false;
        resetGlobalSettings(settings);
    });

    expectSuccess(`// Virtual properties can be overloaded
        class Base {
            int get_size() property {
                return 0;
            }
        }
        
        class Derived : Base {
            private int _size = 10;

            int size = 5;

            int get_size() property override {
                return _size;
            }
        }

        void main(){
            Base@ box = Derived();
            int size = box.size; // 10
        }
    `);

    expectSuccess([{
        uri: 'file:///path/to/as.predefined',
        content: `
            interface IValue {
                int get_value() const property;
            }`
    }, {
        uri: 'file:///path/to/file.as',
        content: `// Interface properties are available.
            class Value : IValue {
                private int m_value;
                int get_value() const property { return m_value; }
            }
            
            void main() {
                IValue@ v = Value();
                const int value = v.value;
            }`
    }]);
});
