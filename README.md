# bench-backburner

## Installation

``` r
# Install Node Modules:
npm install

# Install the Science Tap:
brew tap homebrew/science

# Install R:
brew install r

# Install ggplot2:
R
install.packages("ggplot2")
```

## Usage
- Within your chrome web browser, navigate to your application (http://www.myapp.com)
- Open the Chrome Dev Tools : Network Tab
- Refresh
- Right-click the file for the `document` Type "www.myapp.com" and select "Save as HAR with Content"
- Save the .har (ideally save the file within the the "bench-backburner/.." dir.
- Within "bench-backburner/server.ts" update `const HAR_FILE = ` with the location of the saved .har file and save.

``` r
# Launch the server
npm run-script serve

# In a new terminal tab/window launch the benchmark
npm run-script bench

# Once the benchmark runner runs 50x (default) and completes launch the report
./report.R
```
