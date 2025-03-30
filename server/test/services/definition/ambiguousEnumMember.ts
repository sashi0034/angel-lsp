import {testDefinition} from "./utils";

describe('definition/ambiguousEnumMember', () => {
    testDefinition(`// AngelScript allows ambiguous enum member access.
        enum Color { Red$C0$ }
        enum Status { Red$C1$ }
        namespace detail {
            enum Color { Red$C2$ }
        }
        
        void fn_status(Status s) { }
        void fn_detail_color(detail::Color c) { }
    
        void main() {
            Color c = Red$C3$;
            fn_status(Red$C4$);
            fn_detail_color(Red$C5$);
            detail::Color d_c = Red$C6$;
        }
    `, [[3, 0], [4, 1], [5, 2], [6, 2]]
    );
});
