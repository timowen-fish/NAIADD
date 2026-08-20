#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let launch_requested = std::env::args()
        .skip(1)
        .any(|argument| argument == "--launch-naiadd");

    if launch_requested {
        naiadd_offline_helper_lib::launch_naiadd();
        return;
    }

    naiadd_offline_helper_lib::run();
}
